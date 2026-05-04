# app/routers/subscriptions.py
# Subscriptions router for subscription management

import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from app.database import get_db
from app import crud, models, schemas
from app.auth import get_current_active_user
import stripe

# Load environment variables and initialize Stripe
load_dotenv()
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")


def get_metadata_value(metadata, key):
    if metadata is None:
        return None
    if hasattr(metadata, "get"):
        return metadata.get(key)
    try:
        return metadata[key]
    except Exception:
        return None

def safe_get_attr(obj, attr, default=None):
    """Safely get attribute from object with fallback"""
    try:
        if hasattr(obj, attr):
            val = getattr(obj, attr)
            return val if val is not None else default
        return default
    except Exception:
        return default


router = APIRouter()

@router.get("/my-subscription", response_model=schemas.Subscription)
def read_my_subscription(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get current user's subscription"""
    subscription = crud.get_subscription_by_user(db, user_id=current_user.id)
    if not subscription:
        # Return a default free subscription if none exists
        return schemas.Subscription(
            id=0,
            user_id=current_user.id,
            stripe_customer_id="",
            stripe_subscription_id="",
            plan="free",
            status="active",
            current_period_end=None,
            created_at=current_user.created_at
        )
    return subscription

@router.post("/create-checkout-session")
def create_checkout_session(
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a Stripe checkout session for subscription"""
    try:
        # Create or retrieve Stripe customer
        if not current_user.stripe_customer_id:
            customer = stripe.Customer.create(
                email=current_user.email,
                name=current_user.email.split('@')[0]
            )
            current_user.stripe_customer_id = customer.id
            db.commit()

        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=current_user.stripe_customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': os.getenv("STRIPE_PRICE_ID"),  # Pro plan price ID
                'quantity': 1,
            }],
            mode='subscription',
            success_url='http://localhost:5173/success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url='http://localhost:5173/cancel',
            metadata={'user_id': str(current_user.id)}
        )
        return {"checkout_url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{type(e).__name__}: {repr(e)}")

@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhooks"""
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle the event
    if event.type == 'checkout.session.completed':
        session = event.data.object
        if session.mode == 'subscription' and session.payment_status == 'paid':
            subscription_id = session.subscription
            customer_id = session.customer
            user_id = get_metadata_value(session.metadata, 'user_id')
            if user_id:
                # Check if subscription already exists
                existing = crud.get_subscription_by_stripe_subscription_id(db, subscription_id)
                if not existing:
                    # Fetch subscription details from Stripe
                    stripe_sub = stripe.Subscription.retrieve(subscription_id)
                    period_end = safe_get_attr(stripe_sub, 'current_period_end')
                    crud.create_subscription(db, schemas.SubscriptionCreate(
                        user_id=int(user_id),
                        stripe_customer_id=customer_id,
                        stripe_subscription_id=subscription_id,
                        plan='pro',
                        status='active',
                        current_period_end=datetime.fromtimestamp(period_end) if period_end else None
                    ))
                    # Billing notification: tell the user their subscription is now active
                    crud.create_notification(
                        db,
                        user_id=int(user_id),
                        title="Subscription upgraded to Pro",
                        message="Your subscription has been upgraded to the Pro plan. Enjoy unlimited projects!",
                        type="billing"
                    )
    elif event.type == 'customer.subscription.updated':
        subscription = event.data.object
        existing = crud.get_subscription_by_stripe_subscription_id(db, subscription.id)
        if existing:
            period_end = safe_get_attr(subscription, 'current_period_end')
            crud.update_subscription(db, existing.id, schemas.SubscriptionUpdate(
                status=safe_get_attr(subscription, 'status', 'active'),
                current_period_end=datetime.fromtimestamp(period_end) if period_end else None
            ))
    elif event.type == 'customer.subscription.deleted':
        subscription = event.data.object
        existing = crud.get_subscription_by_stripe_subscription_id(db, subscription.id)
        if existing:
            crud.update_subscription(db, existing.id, schemas.SubscriptionUpdate(status='canceled'))
            # Billing notification: tell the user their subscription was cancelled
            crud.create_notification(
                db,
                user_id=existing.user_id,
                title="Subscription cancelled",
                message="Your Pro subscription has been cancelled. You have been moved to the Free plan.",
                type="billing"
            )

    return {"status": "success"}

@router.post("/process-session/{session_id}")
def process_session(session_id: str, db: Session = Depends(get_db)):
    """Manually process a checkout session (for local testing without webhooks)"""
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        if session.mode == 'subscription' and session.payment_status == 'paid':
            subscription_id = session.subscription
            customer_id = session.customer
            user_id = get_metadata_value(session.metadata, 'user_id')
            if user_id:
                existing = crud.get_subscription_by_stripe_subscription_id(db, subscription_id)
                if not existing:
                    stripe_sub = stripe.Subscription.retrieve(subscription_id)
                    period_end = safe_get_attr(stripe_sub, 'current_period_end')
                    crud.create_subscription(db, schemas.SubscriptionCreate(
                        user_id=int(user_id),
                        stripe_customer_id=customer_id,
                        stripe_subscription_id=subscription_id,
                        plan='pro',
                        status='active',
                        current_period_end=datetime.fromtimestamp(period_end) if period_end else None
                    ))
                    # Billing notification: tell the user their subscription is now active
                    crud.create_notification(
                        db,
                        user_id=int(user_id),
                        title="Subscription upgraded to Pro",
                        message="Your subscription has been upgraded to the Pro plan. Enjoy unlimited projects!",
                        type="billing"
                    )
                    return {"message": "Subscription created successfully"}
        return {"message": "Session already processed or invalid"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{type(e).__name__}: {repr(e)}")