#!/usr/bin/env python3
"""
MySQL 到 OpenLDAP 同步腳本
定期從 MySQL users table 同步用戶到 OpenLDAP
"""

import pymysql
from ldap3 import Server, Connection, ALL, MODIFY_REPLACE, SUBTREE
import time
import logging
import os

# 配置日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MySQL 配置
MYSQL_HOST = os.getenv("MYSQL_HOST", "10.2.240.11")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_DB = os.getenv("MYSQL_DB", "auth")
MYSQL_USER = os.getenv("MYSQL_USER", "usagereportdb")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "1@2Ma89t}yMz75kj")

# OpenLDAP 配置
LDAP_SERVER = os.getenv("LDAP_SERVER", "openldap.auth.svc.cluster.local")
LDAP_PORT = int(os.getenv("LDAP_PORT", "389"))
LDAP_BASE_DN = os.getenv("LDAP_BASE_DN", "dc=ubilink,dc=ai")
LDAP_ADMIN_DN = os.getenv("LDAP_ADMIN_DN", f"cn=admin,{LDAP_BASE_DN}")
LDAP_ADMIN_PASSWORD = os.getenv("LDAP_ADMIN_PASSWORD", "admin123")
LDAP_USERS_OU = f"ou=users,{LDAP_BASE_DN}"

def get_users_from_mysql():
    """從 MySQL 讀取用戶"""
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
        # 先檢查表結構
        cursor.execute("DESCRIBE users")
        columns = [col[0] for col in cursor.fetchall()]
        print(f"Users table columns: {columns}")
        
        # 根據實際欄位構建查詢
        if 'id' in columns:
            cursor.execute("SELECT id, email, name, role FROM users")
        else:
            # 如果沒有 id，使用 email 作為唯一標識
            cursor.execute("SELECT email, name, role FROM users")
        
        users = []
        
        for row in cursor.fetchall():
            if 'id' in columns:
                users.append({
                    "id": str(row[0]),
                    "email": row[1] if row[1] else "",
                    "name": row[2] if row[2] else "",
                    "role": row[3] if len(row) > 3 and row[3] else None
                })
            else:
                users.append({
                    "id": row[0] if row[0] else "",  # 使用 email 作為 id
                    "email": row[0] if row[0] else "",
                    "name": row[1] if row[1] else "",
                    "role": row[2] if len(row) > 2 and row[2] else None
                })
        
        cursor.close()
        conn.close()
        logger.info(f"從 MySQL 讀取到 {len(users)} 個用戶")
        return users
    except Exception as e:
        logger.error(f"無法從 MySQL 讀取用戶: {e}")
        raise

def ensure_ou_exists(conn, ou_dn):
    """確保 OU 存在"""
    try:
        if not conn.search(ou_dn, '(objectClass=*)'):
            conn.add(ou_dn, ['organizationalUnit'])
            logger.info(f"創建 OU: {ou_dn}")
    except Exception as e:
        logger.debug(f"OU 可能已存在: {e}")

def sync_to_openldap(users):
    """同步用戶到 OpenLDAP"""
    server = Server(LDAP_SERVER, port=LDAP_PORT, get_info=ALL)
    
    try:
        with Connection(server, LDAP_ADMIN_DN, LDAP_ADMIN_PASSWORD, auto_bind=True) as conn:
            # 確保 base DN 存在
            try:
                if not conn.search(LDAP_BASE_DN, '(objectClass=*)'):
                    conn.add(LDAP_BASE_DN, ['dcObject', 'organization'])
            except:
                pass
            
            # 確保 users OU 存在
            ensure_ou_exists(conn, LDAP_USERS_OU)
            
            success_count = 0
            error_count = 0
            
            for user in users:
                if not user['email']:
                    logger.warning(f"跳過沒有 email 的用戶: {user}")
                    continue
                
                # 創建用戶 DN
                user_dn = f"uid={user['email']},{LDAP_USERS_OU}"
                
                # 準備屬性
                attributes = {
                    'objectClass': ['inetOrgPerson', 'organizationalPerson', 'person'],
                    'uid': user['email'],
                    'cn': user['name'] or user['email'],
                    'sn': user['name'] or user['email'].split('@')[0],
                    'mail': user['email']
                }
                
                if user['role']:
                    attributes['description'] = str(user['role'])
                
                # 檢查用戶是否存在
                if conn.search(user_dn, '(objectClass=*)'):
                    # 更新現有用戶
                    try:
                        conn.modify(user_dn, {
                            'cn': [(MODIFY_REPLACE, [attributes['cn']])],
                            'sn': [(MODIFY_REPLACE, [attributes['sn']])],
                            'mail': [(MODIFY_REPLACE, [attributes['mail']])]
                        })
                        if user['role']:
                            conn.modify(user_dn, {
                                'description': [(MODIFY_REPLACE, [str(user['role'])])]
                            })
                        logger.info(f"✅ 更新用戶: {user['email']}")
                        success_count += 1
                    except Exception as e:
                        logger.error(f"❌ 更新用戶失敗 {user['email']}: {e}")
                        error_count += 1
                else:
                    # 創建新用戶
                    try:
                        conn.add(user_dn, attributes=attributes)
                        logger.info(f"✅ 創建用戶: {user['email']}")
                        success_count += 1
                    except Exception as e:
                        logger.error(f"❌ 創建用戶失敗 {user['email']}: {e}")
                        error_count += 1
            
            logger.info(f"同步完成: 成功 {success_count}, 失敗 {error_count}")
            return success_count, error_count
            
    except Exception as e:
        logger.error(f"無法連接到 OpenLDAP: {e}")
        raise

def main():
    logger.info("=== MySQL 到 OpenLDAP 同步服務啟動 ===")
    logger.info(f"MySQL: {MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}")
    logger.info(f"OpenLDAP: {LDAP_SERVER}:{LDAP_PORT}")
    
    sync_interval = int(os.getenv("SYNC_INTERVAL", "300"))  # 預設 5 分鐘
    
    while True:
        try:
            users = get_users_from_mysql()
            if users:
                sync_to_openldap(users)
            else:
                logger.warning("沒有找到用戶")
            
            logger.info(f"等待 {sync_interval} 秒後再次同步...")
            time.sleep(sync_interval)
            
        except Exception as e:
            logger.error(f"同步錯誤: {e}")
            logger.info("等待 60 秒後重試...")
            time.sleep(60)

if __name__ == "__main__":
    main()

