from app.config.settings import settings
from app.helper.email_helper import emailConfiguration
from fastapi import APIRouter, status, Depends, Body
from app.config.prisma import prisma
from app.schema.auth_schema import LoginSchema, SignUpSchema
import random
from fastapi_mail import FastMail, MessageSchema
from app.config.jwt import (
    create_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter()


@router.get("/me", summary="Get User by token")
async def get_me(user=Depends(get_current_user)):
    return user


@router.post("/signin", status_code=status.HTTP_200_OK)
async def signIn(data: LoginSchema):
    user = await prisma.user.find_first(where={"email": data.email})
    if user:
        # Check password validity first
        if not data.password or not verify_password(data.password, user.password):
            return {"success": False, "message": "Incorrect email or password."}
        token = create_token(str(user.id))
        # Remove password field before sending response
        user_dict = dict(user)
        user_dict.pop("password", None)
        return {"success": True, "token": token, "user": user_dict}
    else:
        return {
            "success": False,
            "message": "Unable to get your account. Please create new one.",
        }


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(input: SignUpSchema):
    try:
        # Check if email or mobile already exists
        existingUser = await prisma.user.find_first(
            where={"OR": [{"email": input.email}, {"mobile": input.mobile}]},
        )
        if existingUser:
            return {
                "success": False,
                "message": "The email or mobile is already exists.",
            }

        if input.password != input.confirm_password:
            return {
                "success": False,
                "message": "Password not matching with confirm password.",
            }

        payload = input.model_dump()
        payload["password"] = hash_password(payload["password"])
        payload.pop("confirm_password", None)
        payload.pop("createdAt", None)
        payload.pop("updatedAt", None)

        user = await prisma.user.create(data=payload)

        newUser = await prisma.user.find_first(where={"id": user.id})
        if "password" in newUser:
            del newUser["password"]
        # await prisma.user.find({"_id": user.inserted_id})
        return {
            "success": True,
            "token": create_token(str(user.id)),
            "user": newUser,
            "message": "Your account has been created.",
        }
    except Exception as error:
        return {
            "success": False,
            "message": f"Something is wrong: {error.__str__()}",
        }
        # raise HTTPException(
        #     status_code=status.HTTP_400_BAD_REQUEST,
        #     detail=error.__str__(),
        # )


# MOBILE OTP Router
mobile_otp_store = {}


@router.post("/auth/mobile-send-otp")
async def send_otp(mobile: str = Body(..., embed=True)):
    # Generate a 6-digit OTP
    otp = "{:06d}".format(random.randint(100000, 999999))
    mobile_otp_store[mobile] = otp
    # TODO: Integrate with SMS gateway to send OTP to user's mobile here
    return {
        "success": True,
        "message": f"OTP sent to {mobile}.",
        "otp": otp,  # Remove this field in production!
    }


@router.post("/auth/mobile-verify-otp")
async def verify_otp(
    mobile: str = Body(..., embed=True), otp: str = Body(..., embed=True)
):
    expected_otp = mobile_otp_store.get(mobile)
    if expected_otp is None:
        return {
            "success": False,
            "message": "OTP not requested for this mobile.",
        }
    if otp == expected_otp:
        del mobile_otp_store[mobile]
        return {"success": True, "message": "OTP verified successfully."}
    else:
        return {"success": False, "message": "Invalid OTP."}


# Email OTP Verification Store
email_otp_store = {}


@router.post("/auth/email-send-otp")
async def send_email_otp(email: str = Body(..., embed=True)):
    # Generate a 6-digit OTP
    otp = "{:06d}".format(random.randint(100000, 999999))
    email_otp_store[email] = otp

    subject = "Your OTP for Verification"
    body = f"Your verification OTP is: {otp}"

    try:
        message = MessageSchema(
            subject=subject,
            recipients=[email],
            body=body,
            subtype="plain",
        )
        fm = FastMail(emailConfiguration)
        await fm.send_message(message)
        # await fm.send_message(message, background_tasks)
        return {
            "success": True,
            "message": f"OTP sent to {email}.",
        }
    except Exception as e:
        return {"message": f"Failed to send email: {e}", "success": False}


@router.post("/auth/email-verify-otp")
async def verify_email_otp(
    email: str = Body(..., embed=True), otp: str = Body(..., embed=True)
):
    expected_otp = email_otp_store.get(email)
    if expected_otp is None:
        return {
            "success": False,
            "message": "OTP not requested for this email.",
        }
    if otp == expected_otp:
        del email_otp_store[email]
        return {"success": True, "message": "Email OTP verified successfully."}
    else:
        return {"success": False, "message": "Invalid OTP."}


from datetime import datetime, timedelta
import jwt


# In-memory set to track used reset tokens (one-time use)
used_reset_tokens = set()


@router.post("/forgot-password")
async def forgot_password(email: str = Body(..., embed=True)):
    user = await prisma.user.find_first(where={"email": email})
    # Don't reveal if email doesn't exist
    if not user:
        return {
            "success": True,
            "message": "If an account with that email exists, you'll receive a password reset link.",
        }

    # Generate JWT token for reset (expire in 30 minutes)
    payload = {
        "sub": str(user.id),
        "email": email,
        "exp": datetime.utcnow() + timedelta(minutes=30),
        "type": "reset",
    }
    token = jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )

    # Generate reset link (in real use, point to your frontend endpoint)
    reset_link = f"{settings.CLIENT_ORIGIN}/reset-password?token={token}&email={email}"

    subject = "Reset Your Password"
    body = f"""
    <html>
      <body style="font-family:Arial,sans-serif; background-color:#f7f7f7; color:#333; padding:32px;">
        <div style="max-width:520px; background:white; margin:0 auto; border-radius:8px; box-shadow:0 3px 14px rgba(128,0,128,0.16),0 1.5px 4px rgba(128,0,128,0.08); padding:32px;">
          <h2 style="color:#6c2eb8; margin-bottom:16px;">Reset Your Password</h2>
          <p>Hello {user.name},</p>
          <p>
            We received a request to reset your password. 
            Please use the button below to reset your password. This link can only be used once and will expire in 30 minutes.
          </p>
          <div style="text-align:center; margin:32px 0;">
            <a href="{reset_link}" 
               style="
                  display:inline-block; 
                  padding:16px 32px; 
                  background-color:#6c2eb8; 
                  color:#fff; 
                  font-weight:bold; 
                  font-size:16px; 
                  border-radius:6px; 
                  text-decoration:none;
                  box-shadow:0 2px 8px rgba(108,46,184,0.10);">
              Reset Password
            </a>
          </div>
          <p style="color:#888;font-size:13px;">
            If you did not request this, please ignore this email.<br>
            — {settings.APP_NAME} Team
          </p>
        </div>
      </body>
    </html>
    """

    try:
        message = MessageSchema(
            subject=subject,
            recipients=[email],
            body=body,
            subtype="plain",
        )
        fm = FastMail(emailConfiguration)
        await fm.send_message(message)
        return {
            "success": True,
            "message": "If an account with that email exists, you'll receive a password reset link.",
        }
    except Exception as e:
        return {"message": f"Failed to send reset email: {e}", "success": False}


@router.post("/reset-password")
async def reset_password(
    token: str = Body(..., embed=True), new_password: str = Body(..., embed=True)
):
    # Check if token is already used
    if token in used_reset_tokens:
        return {"success": False, "message": "You've already changed your password."}
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        if payload.get("type") != "reset":
            return {"success": False, "message": "Invalid reset token."}
    except jwt.ExpiredSignatureError:
        return {
            "success": False,
            "message": "You're link has expired. Please request a new one.",
        }
    except jwt.InvalidTokenError:
        return {
            "success": False,
            "message": "You're link is invalid. Please request a new one.",
        }

    user_id = int(payload["sub"])
    # user_id = payload["email"]
    print(f"User ID: {user_id}")

    user = await prisma.user.find_unique(where={"id": user_id})
    # user = await prisma.user.find_first(where={"id": user_id, "email": payload["email"]})
    if not user:
        return {"success": False, "message": "User not found."}
    # Expire the token after use so it can't be used multiple times.
    # You can use a persistent or in-memory store. Example below uses in-memory set.
    used_reset_tokens.add(token)

    hashed_pw = hash_password(new_password)
    await prisma.user.update(
        where={"id": user_id},
        data={"password": hashed_pw},
    )

    return {"success": True, "message": "Password has been reset successfully."}
