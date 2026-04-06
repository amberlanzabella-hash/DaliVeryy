import os
import json
import base64
import requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST, require_GET
from dotenv import load_dotenv

load_dotenv()

# PayMongo credentials and base endpoint used for online payments.
PAYMONGO_SECRET = os.getenv("PAYMONGO_SECRET_KEY")
PAYMONGO_BASE = "https://api.paymongo.com/v1"

# Build the PayMongo Basic Auth header from the secret key.
def get_auth_header():
    encoded = base64.b64encode(f"{PAYMONGO_SECRET}:".encode()).decode()
    return {"Authorization": f"Basic {encoded}", "Content-Type": "application/json"}


# Decide which frontend URL PayMongo should redirect back to.
def get_frontend_base_url(request):
    configured_base = os.getenv("FRONTEND_BASE_URL")
    if configured_base:
        return configured_base.rstrip("/")

    origin = request.headers.get("Origin") or request.META.get("HTTP_ORIGIN")
    if origin:
        return origin.rstrip("/")

    host = request.get_host().split(":")[0]
    return f"{request.scheme}://{host}:5175"


# Create a PayMongo payment link for online checkout.
@csrf_exempt
@require_POST
def create_payment_link(request):
    try:
        body = json.loads(request.body)
        order_id = body.get("orderId")
        amount = body.get("amount")  # in PHP pesos
        description = body.get("description", "AguasShop Order")
    except Exception:
        return JsonResponse({"ok": False, "error": "Invalid request."}, status=400)

    if not order_id or not amount:
        return JsonResponse({"ok": False, "error": "Missing orderId or amount."}, status=400)

    # PayMongo amount is in centavos
    amount_centavos = int(float(amount) * 100)

    frontend_base_url = get_frontend_base_url(request)

    payload = {
        "data": {
            "attributes": {
                "amount": amount_centavos,
                "currency": "PHP",
                "description": f"{description} — {order_id}",
                "remarks": order_id,
                "redirect": {
                    "success": f"{frontend_base_url}/payment-success?orderId={order_id}",
                    "failed": f"{frontend_base_url}/payment-failed?orderId={order_id}",
                },
            }
        }
    }

    try:
        res = requests.post(
            f"{PAYMONGO_BASE}/links",
            headers=get_auth_header(),
            json=payload,
        )
        data = res.json()
        if res.status_code not in (200, 201):
            error_msg = data.get("errors", [{}])[0].get("detail", "PayMongo error.")
            return JsonResponse({"ok": False, "error": error_msg}, status=400)

        checkout_url = data["data"]["attributes"]["checkout_url"]
        link_id = data["data"]["id"]
        return JsonResponse({"ok": True, "checkout_url": checkout_url, "link_id": link_id})

    except Exception as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=500)


# Check PayMongo and return the latest payment status for an order.
@csrf_exempt
def verify_payment(request):
    link_id = request.GET.get("link_id") or (json.loads(request.body or "{}").get("link_id"))
    if not link_id:
        return JsonResponse({"ok": False, "error": "Missing link_id."}, status=400)

    try:
        res = requests.get(
            f"{PAYMONGO_BASE}/links/{link_id}",
            headers=get_auth_header(),
        )
        data = res.json()
        status = data["data"]["attributes"]["status"]
        return JsonResponse({"ok": True, "status": status, "paid": status == "paid"})
    except Exception as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=500)
