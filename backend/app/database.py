# app/database.py
# Database configuration and connection

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database URL from environment variable
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://root:1993@localhost:3306/SaaS")

# Create SQLAlchemy engine
engine = create_engine(DATABASE_URL)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()

# Dependency to get database session
def get_db():
    """Dependency function to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()