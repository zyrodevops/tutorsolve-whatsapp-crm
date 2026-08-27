import os
from app import create_app
from app.db.firebase import db
from app.models.user import User
from app.core.security import hash_password

app = create_app()

def seed_admin():
    with app.app_context():
        if not db.client:
            print("Error: Firestore is not initialized. Check FIREBASE_SERVICE_ACCOUNT_B64 in .env.")
            return

        email = "admin@crm.com"
        password = "adminpassword"
        
        users_ref = db.client.collection("users")
        existing = list(users_ref.where("email", "==", email).limit(1).stream())
        
        if existing:
            print(f"Admin already exists with email: {email}")
            return
            
        admin = User(
            full_name="System Admin",
            email=email,
            password_hash=hash_password(password),
            role="ADMIN"
        )
        
        users_ref.document(admin.id).set(admin.to_dict())
        print("=== Admin Seeded Successfully ===")
        print(f"Email: {email}")
        print(f"Password: {password}")

if __name__ == "__main__":
    seed_admin()

