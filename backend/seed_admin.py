import os
from app import create_app
from app.db.database import db
from app.models.user import User
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message
from app.core.security import hash_password

app = create_app()

def seed_admin():
    with app.app_context():
        # Imports ensure models are registered with SQLAlchemy metadata
        db.create_all()
        
        email = "admin@crm.com"
        password = "adminpassword"
        
        existing = db.session.execute(db.select(User).filter_by(email=email)).scalar_one_or_none()
        
        if existing:
            print(f"Admin already exists with email: {email}")
            return
            
        admin = User(
            full_name="System Admin",
            email=email,
            password_hash=hash_password(password),
            role="ADMIN"
        )
        
        db.session.add(admin)
        db.session.commit()
        
        print("=== Admin Seeded Successfully ===")
        print(f"Email: {email}")
        print(f"Password: {password}")

if __name__ == "__main__":
    seed_admin()
