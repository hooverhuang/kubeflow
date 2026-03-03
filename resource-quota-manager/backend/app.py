# resource-quota-manager/backend/app.py
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from functools import wraps
import os
import pymysql
import bcrypt
import logging

app = Flask(__name__, template_folder='../templates', static_folder='../static', static_url_path='/static')
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
CORS(app)

# 配置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MySQL 配置（從環境變量讀取，與 Auth Proxy 一致）
MYSQL_HOST = os.getenv("MYSQL_HOST", "10.2.240.11")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_DB = os.getenv("MYSQL_DB", "auth")
MYSQL_USER = os.getenv("MYSQL_USER", "usagereportdb")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "1@2Ma89t}yMz75kj")

def get_user_from_mysql(username):
    """從 MySQL 獲取用戶信息（使用 username）"""
    try:
        conn = pymysql.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DB,
            charset='utf8mb4'
        )
        cursor = conn.cursor()
        cursor.execute(
            "SELECT username, email, password, name, role FROM users WHERE username = %s",
            (username,)
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row:
            return {
                "username": row[0],
                "email": row[1],
                "password_hash": row[2],
                "name": row[3] or row[0],
                "role": row[4] or "user"
            }
        return None
    except Exception as e:
        logger.error(f"MySQL 查詢錯誤: {e}")
        return None

def verify_bcrypt_password(password, password_hash):
    """驗證 bcrypt 密碼"""
    try:
        if not password_hash or not password_hash.startswith("$2"):
            return False
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"密碼驗證錯誤: {e}")
        return False

def login_required(f):
    """登入驗證裝飾器"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# 加载 Kubernetes 配置
try:
    config.load_incluster_config()  # 在集群内运行
except:
    config.load_kube_config()  # 开发环境

v1 = client.CoreV1Api()

@app.route('/login', methods=['GET', 'POST'])
def login():
    """登入頁面 - 僅允許 reseller_admin 和 platform_admin"""
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if not username or not password:
            return jsonify({'success': False, 'error': 'Username and password are required'}), 400
        
        # 從 MySQL 讀取用戶信息（使用 username）
        user = get_user_from_mysql(username)
        
        if not user:
            logger.warning(f"用戶不存在: {username}")
            return jsonify({'success': False, 'error': 'Invalid username or password'}), 401
        
        # 驗證 bcrypt 密碼
        if not verify_bcrypt_password(password, user['password_hash']):
            logger.warning(f"密碼錯誤: {username}")
            return jsonify({'success': False, 'error': 'Invalid username or password'}), 401
        
        # 檢查角色權限：只有 reseller_admin 或 platform_admin 可以登入
        user_role = user.get('role', '').strip().lower()
        allowed_roles = ['reseller_admin', 'platform_admin']
        
        if user_role not in allowed_roles:
            logger.warning(f"用戶角色無權限登入: {username}, role={user_role}")
            return jsonify({
                'success': False, 
                'error': 'Access denied. Only reseller_admin and platform_admin can access this system.'
            }), 403
        
        # 登入成功
        session['logged_in'] = True
        session['username'] = user['username']
        session['email'] = user.get('email', '')
        session['name'] = user.get('name', user['username'])
        session['role'] = user['role']
        logger.info(f"用戶登入成功: {username}, role={user_role}")
        return jsonify({'success': True, 'redirect': '/'})
    
    # GET 請求：如果已登入則重定向到首頁
    if 'logged_in' in session and session['logged_in']:
        return redirect(url_for('index'))
    
    return render_template('login.html')

@app.route('/logout', methods=['POST'])
def logout():
    """登出"""
    session.clear()
    return jsonify({'success': True, 'redirect': '/login'})

@app.route('/')
@login_required
def index():
    """前端页面"""
    return render_template('index.html')

@app.route('/api/namespaces', methods=['GET'])
def get_namespaces():
    """获取所有 Kubeflow 創建的 namespace（使用標籤選擇器）"""
    try:
        # 使用標籤選擇器過濾 Kubeflow 創建的用戶 namespace
        label_selector = 'app.kubernetes.io/part-of=kubeflow-profile'
        namespaces = v1.list_namespace(label_selector=label_selector)
        
        kubeflow_namespaces = [ns.metadata.name for ns in namespaces.items]
        
        logger.info(f"找到 {len(kubeflow_namespaces)} 個 Kubeflow namespace")
        
        return jsonify({
            'success': True,
            'data': kubeflow_namespaces
        })
    except Exception as e:
        logger.error(f"獲取 namespace 錯誤: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/quota/<namespace>', methods=['GET'])
def get_quota(namespace):
    """获取指定 namespace 的 ResourceQuota"""
    try:
        quotas = v1.list_namespaced_resource_quota(namespace)
        quota_list = []
        
        for quota in quotas.items:
            quota_data = {
                'name': quota.metadata.name,
                'namespace': quota.metadata.namespace,
                'creation_timestamp': quota.metadata.creation_timestamp.isoformat() if quota.metadata.creation_timestamp else None,
                'hard': {},
                'used': {}
            }
            
            if quota.spec.hard:
                for key, value in quota.spec.hard.items():
                    quota_data['hard'][key] = str(value)
            
            if quota.status.used:
                for key, value in quota.status.used.items():
                    quota_data['used'][key] = str(value)
            
            quota_list.append(quota_data)
        
        return jsonify({
            'success': True,
            'data': quota_list
        })
    except ApiException as e:
        if e.status == 404:
            return jsonify({'success': True, 'data': []})
        return jsonify({'success': False, 'error': str(e)}), e.status
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/quota/<namespace>', methods=['POST'])
def create_quota(namespace):
    """创建 ResourceQuota"""
    try:
        data = request.json
        
        quota = client.V1ResourceQuota(
            metadata=client.V1ObjectMeta(
                name=data.get('name', 'resource-quota'),
                namespace=namespace
            ),
            spec=client.V1ResourceQuotaSpec(
                hard=data.get('hard', {})
            )
        )
        
        result = v1.create_namespaced_resource_quota(namespace, quota)
        
        return jsonify({
            'success': True,
            'message': f'ResourceQuota {result.metadata.name} created successfully',
            'data': {
                'name': result.metadata.name,
                'namespace': result.metadata.namespace
            }
        })
    except ApiException as e:
        return jsonify({'success': False, 'error': e.body}), e.status
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/quota/<namespace>/<quota_name>', methods=['PUT'])
def update_quota(namespace, quota_name):
    """更新 ResourceQuota"""
    try:
        data = request.json
        
        quota = v1.read_namespaced_resource_quota(quota_name, namespace)
        
        if 'hard' in data:
            quota.spec.hard = data['hard']
        
        result = v1.replace_namespaced_resource_quota(quota_name, namespace, quota)
        
        return jsonify({
            'success': True,
            'message': f'ResourceQuota {quota_name} updated successfully'
        })
    except ApiException as e:
        return jsonify({'success': False, 'error': e.body}), e.status
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/quota/<namespace>/<quota_name>', methods=['DELETE'])
def delete_quota(namespace, quota_name):
    """删除 ResourceQuota"""
    try:
        v1.delete_namespaced_resource_quota(quota_name, namespace)
        return jsonify({
            'success': True,
            'message': f'ResourceQuota {quota_name} deleted successfully'
        })
    except ApiException as e:
        if e.status == 404:
            return jsonify({'success': False, 'error': 'ResourceQuota not found'}), 404
        return jsonify({'success': False, 'error': e.body}), e.status
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/pods/<namespace>', methods=['GET'])
def get_pods(namespace):
    """获取 namespace 下的所有 Pod 及其资源使用"""
    try:
        from datetime import datetime, timezone
        
        pods = v1.list_namespaced_pod(namespace)
        pod_list = []
        
        for pod in pods.items:
            pod_data = {
                'name': pod.metadata.name,
                'status': pod.status.phase,
                'node_name': pod.spec.node_name if pod.spec.node_name else 'Pending',
                'resources': {
                    'requests': {},
                    'limits': {}
                }
            }
            
            # 計算存活時間
            if pod.status.start_time:
                start_time = pod.status.start_time
                now = datetime.now(timezone.utc)
                if start_time.tzinfo is None:
                    start_time = start_time.replace(tzinfo=timezone.utc)
                
                delta = now - start_time
                days = delta.days
                hours, remainder = divmod(delta.seconds, 3600)
                minutes, seconds = divmod(remainder, 60)
                
                if days > 0:
                    age_str = f"{days} day{'s' if days > 1 else ''}"
                    if hours > 0:
                        age_str += f" {hours}h"
                elif hours > 0:
                    age_str = f"{hours}h {minutes}m"
                elif minutes > 0:
                    age_str = f"{minutes}m {seconds}s"
                else:
                    age_str = f"{seconds}s"
                
                pod_data['age'] = age_str
                pod_data['start_time'] = start_time.isoformat()
            else:
                pod_data['age'] = 'Unknown'
                pod_data['start_time'] = None
            
            for container in pod.spec.containers:
                if container.resources:
                    if container.resources.requests:
                        for key, value in container.resources.requests.items():
                            pod_data['resources']['requests'][key] = str(value)
                    if container.resources.limits:
                        for key, value in container.resources.limits.items():
                            pod_data['resources']['limits'][key] = str(value)
            
            pod_list.append(pod_data)
        
        return jsonify({
            'success': True,
            'data': pod_list
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gpu/usage', methods=['GET'])
def get_gpu_usage():
    """获取集群 GPU 使用情况"""
    try:
        gpu_resource = 'nvidia.com/gpu'
        
        # 获取所有节点及其 GPU 容量
        nodes = v1.list_node()
        total_gpu = 0
        node_gpu_info = []
        node_used_gpu = {}  # 用于统计每个节点的已使用 GPU
        
        for node in nodes.items:
            node_gpu = 0
            if node.status.allocatable and gpu_resource in node.status.allocatable:
                node_gpu = int(node.status.allocatable[gpu_resource])
                total_gpu += node_gpu
            
            node_name = node.metadata.name
            node_used_gpu[node_name] = 0  # 初始化
            
            node_gpu_info.append({
                'name': node_name,
                'total_gpu': node_gpu,
                'allocatable': dict(node.status.allocatable) if node.status.allocatable else {}
            })
        
        # 获取所有 Pod 的 GPU 使用情况
        all_pods = v1.list_pod_for_all_namespaces()
        total_used_gpu = 0
        namespace_gpu_usage = {}
        pod_gpu_list = []
        
        for pod in all_pods.items:
            # 只统计运行中的 Pod
            if pod.status.phase not in ['Running', 'Pending']:
                continue
            
            pod_gpu = 0
            namespace = pod.metadata.namespace
            pod_node = pod.spec.node_name if pod.spec.node_name else None
            
            for container in pod.spec.containers:
                if container.resources and container.resources.requests:
                    if gpu_resource in container.resources.requests:
                        try:
                            container_gpu = int(container.resources.requests[gpu_resource])
                            pod_gpu += container_gpu
                        except (ValueError, TypeError):
                            # 如果不是数字，尝试转换
                            gpu_str = str(container.resources.requests[gpu_resource])
                            try:
                                container_gpu = int(float(gpu_str))
                                pod_gpu += container_gpu
                            except:
                                pass
            
            if pod_gpu > 0:
                total_used_gpu += pod_gpu
                
                # 按 namespace 统计
                if namespace not in namespace_gpu_usage:
                    namespace_gpu_usage[namespace] = 0
                namespace_gpu_usage[namespace] += pod_gpu
                
                # 按节点统计已使用 GPU
                if pod_node and pod_node in node_used_gpu:
                    node_used_gpu[pod_node] += pod_gpu
                
                pod_gpu_list.append({
                    'name': pod.metadata.name,
                    'namespace': namespace,
                    'status': pod.status.phase,
                    'gpu': pod_gpu,
                    'node': pod_node if pod_node else 'Pending'
                })
        
        # 更新每个节点的已使用和可用 GPU
        for node_info in node_gpu_info:
            node_name = node_info['name']
            used = node_used_gpu.get(node_name, 0)
            total = node_info['total_gpu']
            available = total - used
            node_info['used_gpu'] = used
            node_info['available_gpu'] = available
        
        # 计算可用 GPU
        available_gpu = total_gpu - total_used_gpu
        
        # 按 namespace 排序
        namespace_gpu_sorted = sorted(
            namespace_gpu_usage.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        return jsonify({
            'success': True,
            'data': {
                'summary': {
                    'total_gpu': total_gpu,
                    'used_gpu': total_used_gpu,
                    'available_gpu': available_gpu,
                    'usage_percentage': round((total_used_gpu / total_gpu * 100) if total_gpu > 0 else 0, 2)
                },
                'nodes': node_gpu_info,
                'namespace_usage': [
                    {'namespace': ns, 'gpu': gpu}
                    for ns, gpu in namespace_gpu_sorted
                ],
                'pods': pod_gpu_list
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gpu/usage/<namespace>', methods=['GET'])
def get_namespace_gpu_usage(namespace):
    """获取指定 namespace 的 GPU 使用情况"""
    try:
        gpu_resource = 'nvidia.com/gpu'
        
        # 获取该 namespace 的所有 Pod
        pods = v1.list_namespaced_pod(namespace)
        namespace_gpu = 0
        pod_list = []
        
        for pod in pods.items:
            if pod.status.phase not in ['Running', 'Pending']:
                continue
            
            pod_gpu = 0
            for container in pod.spec.containers:
                if container.resources and container.resources.requests:
                    if gpu_resource in container.resources.requests:
                        try:
                            container_gpu = int(container.resources.requests[gpu_resource])
                            pod_gpu += container_gpu
                        except (ValueError, TypeError):
                            gpu_str = str(container.resources.requests[gpu_resource])
                            try:
                                container_gpu = int(float(gpu_str))
                                pod_gpu += container_gpu
                            except:
                                pass
            
            if pod_gpu > 0:
                namespace_gpu += pod_gpu
                pod_list.append({
                    'name': pod.metadata.name,
                    'status': pod.status.phase,
                    'gpu': pod_gpu,
                    'node': pod.spec.node_name if pod.spec.node_name else 'Pending'
                })
        
        return jsonify({
            'success': True,
            'data': {
                'namespace': namespace,
                'total_gpu': namespace_gpu,
                'pods': pod_list
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/pods/<namespace>/<pod_name>/logs', methods=['GET'])
def get_pod_logs(namespace, pod_name):
    """获取 Pod 的日誌"""
    try:
        # 獲取查詢參數
        container = request.args.get('container', None)
        tail_lines = request.args.get('tail', '100', type=int)
        follow = request.args.get('follow', 'false').lower() == 'true'
        
        # 如果沒有指定容器，獲取 Pod 的第一個容器名稱
        if not container:
            pod = v1.read_namespaced_pod(pod_name, namespace)
            if not pod.spec.containers:
                return jsonify({'success': False, 'error': 'Pod has no containers'}), 400
            container = pod.spec.containers[0].name
        
        # 獲取日誌
        logs = v1.read_namespaced_pod_log(
            name=pod_name,
            namespace=namespace,
            container=container,
            tail_lines=tail_lines,
            follow=follow,
            _preload_content=False
        )
        
        log_content = logs.read().decode('utf-8')
        
        return jsonify({
            'success': True,
            'data': {
                'pod_name': pod_name,
                'namespace': namespace,
                'container': container,
                'logs': log_content,
                'lines': len(log_content.split('\n'))
            }
        })
    except ApiException as e:
        if e.status == 404:
            return jsonify({'success': False, 'error': 'Pod or container not found'}), 404
        return jsonify({'success': False, 'error': str(e)}), e.status
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)