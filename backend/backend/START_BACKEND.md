# AguasShop Backend — Setup & Run

## 1. Install dependencies
```bash
pip install -r requirements.txt
```

## Database

This backend supports both:

- SQLite by default
- PostgreSQL when `DATABASE_URL` is set in `.env`

If you want to move the project to PostgreSQL and keep your current SQLite data,
follow the guide in:

`/home/secrepogi123/Downloads/DaliVeryTESTING2/DaliVeryTESTING/backend/POSTGRES_MIGRATION.md`

## 2. Run migrations
```bash
python manage.py migrate
```

## 3. (Optional) Create a superuser/admin
```bash
python manage.py createsuperuser
```
> Set `is_staff=True` — this will make them login as `admin` role in the React app.

## 4. Start the server
```bash
python manage.py runserver 8000
```

The API will be available at: http://localhost:8000

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/accounts/send-otp/` | Send OTP to email |
| POST | `/api/accounts/register/` | Register with OTP verification |
| POST | `/api/accounts/login/` | Login and get user info |

## .env (already configured)
The `.env` file contains the Gmail SMTP credentials.
Make sure it stays in the same folder as `manage.py`.

## CORS
The backend is configured to accept requests from any origin (for development).
