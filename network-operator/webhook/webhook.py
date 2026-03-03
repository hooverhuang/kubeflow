#!/usr/bin/env python3
"""
RDMA Auto Injector Webhook
自動為請求 GPU 的 Pod 注入 RDMA 資源和 NCCL 環境變數
自動在目標命名空間創建 ConfigMap（如果不存在）
"""
import json
import base64
import os
import ssl
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# 配置
CONFIG = {
    "rdmaResourceName": "rdma/rdma_shared_device_a",
    "rdmaResourceValue": "1",
    "configMapName": "nccl-rdma-env",
    "excludeNamespaces": ["kube-system", "kube-public", "kube-node-lease", "istio-system", "nvidia-network-operator"],
    "ncclEnvVars": {
        "NCCL_IB_DISABLE": "0",
        "NCCL_IB_HCA": "mlx5",
        "NCCL_DEBUG": "INFO",
        "NCCL_IB_GID_INDEX": "3",
        "NCCL_IB_SL": "0",
        "NCCL_IB_TC": "41",
        "NCCL_IB_TIMEOUT": "22",
        "NCCL_SOCKET_IFNAME": "eth0"
    }
}

# Kubernetes API 配置
K8S_API_SERVER = "https://kubernetes.default.svc"
K8S_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token"
K8S_CA_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """多線程 HTTP 服務器"""
    daemon_threads = True

def get_k8s_token():
    """讀取 ServiceAccount Token"""
    try:
        with open(K8S_TOKEN_PATH, 'r') as f:
            return f.read().strip()
    except Exception as e:
        print(f"[Webhook] 無法讀取 K8s token: {e}", flush=True)
        return None

def create_ssl_context():
    """創建 SSL 上下文用於 K8s API 調用"""
    ctx = ssl.create_default_context()
    if os.path.exists(K8S_CA_PATH):
        ctx.load_verify_locations(K8S_CA_PATH)
    else:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx

def check_configmap_exists(namespace):
    """檢查 ConfigMap 是否存在"""
    token = get_k8s_token()
    if not token:
        return False
    
    url = f"{K8S_API_SERVER}/api/v1/namespaces/{namespace}/configmaps/{CONFIG['configMapName']}"
    req = urllib.request.Request(url, method='GET')
    req.add_header('Authorization', f'Bearer {token}')
    
    try:
        ctx = create_ssl_context()
        urllib.request.urlopen(req, context=ctx, timeout=5)
        return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        print(f"[Webhook] 檢查 ConfigMap 時出錯: {e}", flush=True)
        return False
    except Exception as e:
        print(f"[Webhook] 檢查 ConfigMap 時出錯: {e}", flush=True)
        return False

def create_configmap(namespace):
    """在目標命名空間創建 ConfigMap"""
    token = get_k8s_token()
    if not token:
        print(f"[Webhook] 無法創建 ConfigMap：沒有 token", flush=True)
        return False
    
    configmap = {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {
            "name": CONFIG["configMapName"],
            "namespace": namespace,
            "labels": {
                "app": "nccl-rdma-config",
                "created-by": "rdma-auto-injector"
            }
        },
        "data": CONFIG["ncclEnvVars"]
    }
    
    url = f"{K8S_API_SERVER}/api/v1/namespaces/{namespace}/configmaps"
    data = json.dumps(configmap).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', 'application/json')
    
    try:
        ctx = create_ssl_context()
        urllib.request.urlopen(req, context=ctx, timeout=5)
        print(f"[Webhook] ✓ 已在 {namespace} 命名空間創建 ConfigMap: {CONFIG['configMapName']}", flush=True)
        return True
    except urllib.error.HTTPError as e:
        if e.code == 409:  # Already exists
            print(f"[Webhook] ConfigMap 已存在於 {namespace}", flush=True)
            return True
        print(f"[Webhook] 創建 ConfigMap 失敗: {e.code} {e.reason}", flush=True)
        try:
            error_body = e.read().decode('utf-8')
            print(f"[Webhook] 錯誤詳情: {error_body}", flush=True)
        except:
            pass
        return False
    except Exception as e:
        print(f"[Webhook] 創建 ConfigMap 時出錯: {e}", flush=True)
        return False

def ensure_configmap(namespace):
    """確保目標命名空間有 ConfigMap"""
    if namespace in CONFIG["excludeNamespaces"]:
        return
    
    if not check_configmap_exists(namespace):
        print(f"[Webhook] ConfigMap 不存在於 {namespace}，正在創建...", flush=True)
        create_configmap(namespace)

class WebhookHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    
    def do_POST(self):
        path = self.path.split('?')[0]
        if path == "/mutate":
            self.handle_mutate()
        elif path == "/healthz":
            self.handle_health()
        else:
            self.send_error(404)
    
    def do_GET(self):
        path = self.path.split('?')[0]
        if path == "/healthz":
            self.handle_health()
        else:
            self.send_error(404)
    
    def handle_health(self):
        response = b'{"status": "ok"}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(response)))
        self.end_headers()
        self.wfile.write(response)
    
    def handle_mutate(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            admission_review = json.loads(post_data.decode('utf-8'))
            request = admission_review.get("request", {})
            pod = request.get("object", {})
            namespace = pod.get("metadata", {}).get("namespace", "unknown")
            pod_name = pod.get("metadata", {}).get("name", pod.get("metadata", {}).get("generateName", "unknown"))
            
            print(f"[Webhook] 收到請求: namespace={namespace}, pod={pod_name}", flush=True)
            
            # 檢查是否需要注入
            if self.should_inject(pod):
                print(f"[Webhook] 需要注入 RDMA 資源到 {pod_name}", flush=True)
                
                # 確保目標命名空間有 ConfigMap
                ensure_configmap(namespace)
                
                patch = self.create_patch(pod)
                patch_b64 = base64.b64encode(json.dumps(patch).encode()).decode()
                
                admission_response = {
                    "uid": request.get("uid"),
                    "allowed": True,
                    "patch": patch_b64,
                    "patchType": "JSONPatch"
                }
            else:
                print(f"[Webhook] 不需要注入: {pod_name}", flush=True)
                admission_response = {
                    "uid": request.get("uid"),
                    "allowed": True
                }
            
            admission_review_response = {
                "apiVersion": "admission.k8s.io/v1",
                "kind": "AdmissionReview",
                "response": admission_response
            }
            
            response_body = json.dumps(admission_review_response).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)
            
        except Exception as e:
            print(f"[Webhook] Error: {e}", flush=True)
            import traceback
            traceback.print_exc()
            error_response = {
                "apiVersion": "admission.k8s.io/v1",
                "kind": "AdmissionReview",
                "response": {
                    "uid": "",
                    "allowed": False,
                    "status": {
                        "code": 500,
                        "message": str(e)
                    }
                }
            }
            response_body = json.dumps(error_response).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)
    
    def should_inject(self, pod):
        """判斷是否需要注入 RDMA 資源"""
        namespace = pod.get("metadata", {}).get("namespace", "")
        if namespace in CONFIG["excludeNamespaces"]:
            return False
        
        containers = pod.get("spec", {}).get("containers", [])
        for container in containers:
            resources = container.get("resources", {})
            requests = resources.get("requests", {})
            if "nvidia.com/gpu" in requests:
                gpu_val = requests.get("nvidia.com/gpu", "0")
                try:
                    if int(gpu_val) > 0 and CONFIG["rdmaResourceName"] not in requests:
                        return True
                except (ValueError, TypeError):
                    if gpu_val and CONFIG["rdmaResourceName"] not in requests:
                        return True
        
        return False
    
    def create_patch(self, pod):
        """創建 JSON Patch 來注入 RDMA 資源和環境變數"""
        patch = []
        containers = pod.get("spec", {}).get("containers", [])
        
        for i, container in enumerate(containers):
            resources = container.get("resources", {})
            requests = resources.get("requests", {})
            
            if "nvidia.com/gpu" not in requests:
                continue
            
            gpu_val = requests.get("nvidia.com/gpu", "0")
            try:
                has_gpu = int(gpu_val) > 0
            except (ValueError, TypeError):
                has_gpu = bool(gpu_val)
            
            if not has_gpu or CONFIG["rdmaResourceName"] in requests:
                continue
            
            rdma_path = CONFIG['rdmaResourceName'].replace('/', '~1')
            
            # 添加 RDMA 資源請求
            patch.append({
                "op": "add",
                "path": f"/spec/containers/{i}/resources/requests/{rdma_path}",
                "value": CONFIG["rdmaResourceValue"]
            })
            
            # 添加 RDMA 資源限制
            limits = resources.get("limits", {})
            if "limits" not in resources:
                patch.append({
                    "op": "add",
                    "path": f"/spec/containers/{i}/resources/limits",
                    "value": {}
                })
            if CONFIG["rdmaResourceName"] not in limits:
                patch.append({
                    "op": "add",
                    "path": f"/spec/containers/{i}/resources/limits/{rdma_path}",
                    "value": CONFIG["rdmaResourceValue"]
                })
            
            # 添加 envFrom（如果不存在）
            if "envFrom" not in container:
                patch.append({
                    "op": "add",
                    "path": f"/spec/containers/{i}/envFrom",
                    "value": []
                })
            
            # 添加 ConfigMap 引用（設為 optional，避免 ConfigMap 不存在時 Pod 啟動失敗）
            patch.append({
                "op": "add",
                "path": f"/spec/containers/{i}/envFrom/-",
                "value": {
                    "configMapRef": {
                        "name": CONFIG["configMapName"],
                        "optional": True
                    }
                }
            })
        
        return patch
    
    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}", flush=True)

def main():
    port = int(os.environ.get("WEBHOOK_PORT", "8443"))
    cert_path = os.environ.get("TLS_CERT_PATH", "/etc/webhook/certs/tls.crt")
    key_path = os.environ.get("TLS_KEY_PATH", "/etc/webhook/certs/tls.key")
    
    print(f"[Webhook] 啟動中...", flush=True)
    print(f"[Webhook] 端口: {port}", flush=True)
    print(f"[Webhook] 功能: 自動注入 RDMA 資源 + 自動創建 ConfigMap", flush=True)
    
    server = ThreadedHTTPServer(('0.0.0.0', port), WebhookHandler)
    
    # 設置 SSL
    if os.path.exists(cert_path) and os.path.exists(key_path):
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert_path, key_path)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        print(f"[Webhook] TLS 已啟用", flush=True)
    else:
        print(f"[Webhook] 警告: TLS 證書未找到，使用 HTTP", flush=True)
    
    print(f"[Webhook] 服務器已啟動，監聽端口 {port}", flush=True)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Webhook] 關閉中...", flush=True)
        server.shutdown()

if __name__ == "__main__":
    main()
