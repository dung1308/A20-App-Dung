"""
Utility script to create, reset passwords or promote users to Admin.
Usage on Railway Console:
python reset_admin.py --email admin@example.com --password NewPassword123! --role admin
"""
import argparse
import sys
import os

# Đảm bảo script có thể import các module local khi chạy độc lập
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import database
from models.schemas import User
from services.db_service import DBService
from sqlalchemy import func

def manage_user(email, new_password=None, new_role=None):
    # Khởi tạo kết nối database để gán giá trị cho SessionLocal
    database.init_database()
    db_service = DBService()
    
    with database.SessionLocal() as session:
        # Case-insensitive search
        user = session.query(User).filter(func.lower(User.email) == func.lower(email)).first()
        
        if not user:
            if not new_password:
                print(f"Error: User with email '{email}' not found and no password provided for creation.")
                return
            
            print(f"User '{email}' not found. Creating a new account...")
            # Sử dụng logic upsert để tạo cả bản ghi User và Student tương ứng
            db_service.upsert_student_profile(email, {
                "email": email,
                "password": new_password,
                "role": new_role or "admin",
                "full_name": "System Admin"
            })
            print(f"Success: Created new {new_role or 'admin'} user: {email}")
            return

        if new_password:
            user.hashed_password = db_service.hash_password(new_password)
            print(f"Success: Password for {email} has been reset.")
            
        if new_role:
            user.role = new_role
            print(f"Success: Role for {email} updated to {new_role}.")
            
        session.commit()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VinUni Admin Recovery Tool")
    parser.add_argument("--email", required=True, help="Email of the account to reset")
    parser.add_argument("--password", help="New password to set")
    parser.add_argument("--role", choices=["admin", "editor", "user"], help="New role to assign")
    
    args = parser.parse_args()
    
    if not args.password and not args.role:
        print("Error: You must provide either --password or --role to update.")
    else:
        # Ensure we are in the right directory for relative imports if necessary
        manage_user(args.email, args.password, args.role)