import os
import json
import uuid
import hmac
import hashlib
import sqlite3
import requests

from flask import (
    Flask,
    jsonify,
    render_template,
    request
)

from dotenv import load_dotenv


# ============================================================
# CONFIGURATION
# ============================================================

load_dotenv()

app = Flask(__name__)


# ============================================================
# SHOP2TOPUP
# ============================================================

API_URL = "https://shop2topup.com/api/endpoints/v1"

API_KEY = os.getenv("S2T_KEY")

CATEGORY_ID = int(
    os.getenv("CATEGORY_ID", "4")
)


# ============================================================
# FIVEONE PAY
# ============================================================

FIVEONE_API_URL = "https://api.fiveonepay.com/v1"

FIVEONE_SECRET_KEY = os.getenv(
    "FIVEONE_SECRET_KEY"
)

FIVEONE_WEBHOOK_SECRET = os.getenv(
    "FIVEONE_WEBHOOK_SECRET"
)

PUBLIC_BASE_URL = os.getenv(
    "PUBLIC_BASE_URL",
    "http://127.0.0.1:5000"
)


# ============================================================
# CONVERSION
# ============================================================

USD_TO_MGA = float(
    os.getenv("USD_TO_MGA", "4600")
)


# ============================================================
# FRAIS FIVEONE
# ============================================================

FIVEONE_FEE_PERCENT = float(
    os.getenv(
        "FIVEONE_FEE_PERCENT",
        "2.75"
    )
)

FIVEONE_FEE_MIN = int(
    os.getenv(
        "FIVEONE_FEE_MIN",
        "100"
    )
)

FIVEONE_FEE_MAX = int(
    os.getenv(
        "FIVEONE_FEE_MAX",
        "16500"
    )
)


# ============================================================
# DATABASE
# ============================================================

DATABASE = os.getenv(
    "DATABASE",
    "libre_topup.db"
)


def get_db():

    conn = sqlite3.connect(
        DATABASE,
        timeout=30
    )

    conn.row_factory = sqlite3.Row

    return conn


def init_db():

    conn = get_db()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS orders (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            order_id TEXT UNIQUE NOT NULL,

            player_id TEXT NOT NULL,

            product_id INTEGER NOT NULL,

            product_name TEXT,

            shop_price_usd TEXT,

            shop_price_mga INTEGER NOT NULL,

            fiveone_fee_mga INTEGER NOT NULL,

            amount_mga INTEGER NOT NULL,

            payment_reference TEXT UNIQUE,

            payment_status TEXT DEFAULT 'PENDING',

            topup_status TEXT DEFAULT 'PENDING',

            shop_order_id TEXT,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS webhook_events (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            event_id TEXT UNIQUE NOT NULL,

            event_type TEXT,

            processed INTEGER DEFAULT 0,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

        )
    """)

    conn.commit()

    conn.close()

    print(
        "✓ Base de données initialisée.",
        flush=True
    )


# ============================================================
# HEADERS SHOP2TOPUP
# ============================================================

def get_headers():

    if not API_KEY:

        raise RuntimeError(
            "S2T_KEY n'est pas configurée dans .env"
        )

    return {
        "Authorization":
            f"Bearer {API_KEY}",

        "Content-Type":
            "application/json",

        "Accept":
            "application/json",

        "User-Agent":
            "LibreTopup/1.0"
    }


# ============================================================
# HEADERS FIVEONE
# ============================================================

def get_fiveone_headers(
    idempotency_key=None
):

    if not FIVEONE_SECRET_KEY:

        raise RuntimeError(
            "FIVEONE_SECRET_KEY "
            "n'est pas configurée."
        )

    headers = {

        "Authorization":
            f"Bearer {FIVEONE_SECRET_KEY}",

        "Content-Type":
            "application/json",

        "Accept":
            "application/json"
    }

    if idempotency_key:

        headers[
            "Idempotency-Key"
        ] = idempotency_key

    return headers


# ============================================================
# CALCUL DES FRAIS FIVEONE
# ============================================================

def calculate_customer_price(
    shop_price_mga
):

    shop_price_mga = int(
        shop_price_mga
    )

    fee = round(

        shop_price_mga
        * FIVEONE_FEE_PERCENT
        / 100

    )

    # Minimum
    fee = max(
        fee,
        FIVEONE_FEE_MIN
    )

    # Maximum
    fee = min(
        fee,
        FIVEONE_FEE_MAX
    )

    customer_price = (
        shop_price_mga + fee
    )

    return customer_price, fee


# ============================================================
# PRIX SHOP2TOPUP
# ============================================================

def get_shop2topup_price(
    product_id
):

    url = (
        f"{API_URL}"
        f"/catalog/subcategory/"
        f"{int(product_id)}/price"
    )

    try:

        print(
            "=" * 60,
            flush=True
        )

        print(
            f"RÉCUPÉRATION PRIX SHOP2TOPUP "
            f"PRODUIT {product_id}",
            flush=True
        )

        response = requests.get(

            url,

            headers=get_headers(),

            timeout=(10, 30)

        )

        print(
            "SHOP2TOPUP HTTP:",
            response.status_code,
            flush=True
        )

        print(
            "SHOP2TOPUP RESPONSE:",
            response.text,
            flush=True
        )

        response.raise_for_status()

        result = response.json()

        if not result.get(
            "success"
        ):

            raise RuntimeError(

                result.get(
                    "message",
                    "SHOP2TOPUP a refusé "
                    "la requête."
                )
            )

        data = result.get(
            "data",
            {}
        )

        price = data.get(
            "unit_price"
        )

        if price is None:

            raise RuntimeError(

                "SHOP2TOPUP n'a pas retourné "
                "unit_price."
            )

        return str(price)

    except requests.RequestException as e:

        raise RuntimeError(

            "Erreur lors de la récupération "
            f"du prix SHOP2TOPUP : {e}"
        )


# ============================================================
# PAGE PRINCIPALE
# ============================================================

@app.route("/")
def index():

    return render_template(
        "index.html"
    )


# ============================================================
# PRODUITS
# ============================================================

@app.route("/api/products")
def products():

    try:

        response = requests.get(

            f"{API_URL}"
            "/catalog/subcategories",

            params={
                "categoryId":
                    CATEGORY_ID
            },

            headers=get_headers(),

            timeout=(10, 30)
        )

        response.raise_for_status()

        result = response.json()

        if not result.get(
            "success"
        ):

            return jsonify({

                "success": False,

                "error":
                    "SHOP2TOPUP a refusé "
                    "la requête."

            }), 400

        products = []

        for item in result.get(
            "data",
            []
        ):

            price_usd = float(
                item.get(
                    "price",
                    0
                )
            )

            shop_price_mga = round(
                price_usd
                * USD_TO_MGA
            )

            customer_price, fee = (
                calculate_customer_price(
                    shop_price_mga
                )
            )

            products.append({

                "id":
                    item.get(
                        "item_id"
                    ),

                "name":
                    item.get(
                        "name"
                    ),

                "price":
                    price_usd,

                "shop_price_mga":
                    shop_price_mga,

                "fiveone_fee":
                    fee,

                "price_mga":
                    customer_price,

                "fulfillment_type":
                    item.get(
                        "fulfillment_type"
                    ),

                "returns_voucher":
                    item.get(
                        "returns_voucher"
                    )
            })

        return jsonify({

            "success": True,

            "products":
                products

        })

    except requests.RequestException as e:

        return jsonify({

            "success": False,

            "error":
                f"Erreur réseau : {e}"

        }), 500

    except Exception as e:

        return jsonify({

            "success": False,

            "error":
                str(e)

        }), 500


# ============================================================
# VALIDATION UID
# ============================================================

@app.route(
    "/api/validate",
    methods=["POST"]
)
def validate_player():

    data = (
        request.get_json(
            silent=True
        )
        or {}
    )

    player_id = str(
        data.get(
            "player_id",
            ""
        )
    ).strip()

    product_id = data.get(
        "product_id",
        28
    )

    if not player_id:

        return jsonify({

            "success": False,

            "error":
                "UID manquant."

        }), 400

    if (
        len(player_id) < 5
        or len(player_id) > 20
        or not player_id.isdigit()
    ):

        return jsonify({

            "success": False,

            "error":
                "UID Free Fire invalide."

        }), 400

    try:

        payload = {

            "sub_category_id":
                int(product_id),

            "player_id":
                player_id
        }

        response = requests.post(

            f"{API_URL}"
            "/player/validate",

            headers=get_headers(),

            json=payload,

            timeout=(10, 30)

        )

        result = response.json()

        if response.status_code >= 400:

            return jsonify({

                "success": False,

                "error":
                    result.get(
                        "message",
                        "UID non valide."
                    ),

                "details":
                    result

            }), response.status_code

        return jsonify(
            result
        ), response.status_code

    except requests.RequestException as e:

        return jsonify({

            "success": False,

            "error":
                f"Erreur réseau : {e}"

        }), 500

    except Exception as e:

        return jsonify({

            "success": False,

            "error":
                str(e)

        }), 500


# ============================================================
# CREATION COMMANDE INTERNE
# ============================================================

def create_internal_order(

    player_id,

    product_id,

    product_name,

    shop_price_usd,

    shop_price_mga,

    fiveone_fee,

    amount_mga

):

    order_id = str(
        uuid.uuid4()
    )

    payment_reference = (
        f"LT-{order_id}"
    )

    conn = get_db()

    conn.execute("""

        INSERT INTO orders (

            order_id,

            player_id,

            product_id,

            product_name,

            shop_price_usd,

            shop_price_mga,

            fiveone_fee_mga,

            amount_mga,

            payment_reference,

            payment_status,

            topup_status

        )

        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

    """, (

        order_id,

        player_id,

        int(product_id),

        product_name,

        str(shop_price_usd),

        int(shop_price_mga),

        int(fiveone_fee),

        int(amount_mga),

        payment_reference,

        "PENDING",

        "PENDING"

    ))

    conn.commit()

    conn.close()

    return order_id


# ============================================================
# CREATION PAIEMENT FIVEONE
# ============================================================

def create_fiveone_payment(

    order_id,

    amount_mga

):

    reference = (
        f"LT-{order_id}"
    )

    # IMPORTANT :
    # Aucun operator imposé.
    #
    # Aucun currency.
    #
    # Le montant est en MGA.

    payload = {

        "amount":
            int(amount_mga),

        "reference":
            reference,

        "callbackUrl": (
            f"{PUBLIC_BASE_URL}"
            "/webhooks/fiveonepay"
        ),

        "successUrl": (

            f"{PUBLIC_BASE_URL}"
            f"/?payment=success"
            f"&order_id={order_id}"

        ),

        "cancelUrl": (

            f"{PUBLIC_BASE_URL}"
            f"/?payment=cancel"
            f"&order_id={order_id}"

        )
    }

    print(
        "=" * 60,
        flush=True
    )

    print(
        "CREATION PAIEMENT FIVEONE",
        flush=True
    )

    print(
        json.dumps(
            payload,
            indent=2,
            ensure_ascii=False
        ),
        flush=True
    )

    response = requests.post(

        f"{FIVEONE_API_URL}/payments",

        headers=get_fiveone_headers(
            order_id
        ),

        json=payload,

        timeout=(10, 30)
    )

    print(
        "FIVEONE STATUS:",
        response.status_code,
        flush=True
    )

    print(
        "FIVEONE RESPONSE:",
        response.text,
        flush=True
    )

    try:

        result = response.json()

    except Exception:

        result = {

            "success": False,

            "message":
                response.text

        }

    if response.status_code >= 400:

        message = (

            result.get(
                "message"
            )

            or result.get(
                "error"
            )

            or
            "FiveOne Pay a refusé "
            "le paiement."
        )

        if isinstance(
            message,
            list
        ):

            message = " | ".join(
                str(x)
                for x in message
            )

        raise RuntimeError(
            message
        )

    return result


# ============================================================
# API PAYMENT
# ============================================================

@app.route(
    "/api/payment",
    methods=["POST"]
)
def create_payment():

    data = (
        request.get_json(
            silent=True
        )
        or {}
    )

    player_id = str(
        data.get(
            "player_id",
            ""
        )
    ).strip()

    product_id = data.get(
        "product_id"
    )

    if not player_id:

        return jsonify({

            "success": False,

            "error":
                "UID manquant."

        }), 400

    if (
        not product_id
        or not str(
            product_id
        ).isdigit()
    ):

        return jsonify({

            "success": False,

            "error":
                "Produit invalide."

        }), 400

    product_id = int(
        product_id
    )

    try:

        # ====================================================
        # 1. RÉCUPÉRER LE CATALOGUE
        # ====================================================

        response = requests.get(

            f"{API_URL}"
            "/catalog/subcategories",

            params={
                "categoryId":
                    CATEGORY_ID
            },

            headers=get_headers(),

            timeout=(10, 30)

        )

        response.raise_for_status()

        catalog = response.json()

        if not catalog.get(
            "success"
        ):

            raise RuntimeError(

                "Impossible de récupérer "
                "le catalogue SHOP2TOPUP."
            )

        product = None

        for item in catalog.get(
            "data",
            []
        ):

            if int(
                item.get(
                    "item_id"
                )
            ) == product_id:

                product = item

                break

        if product is None:

            return jsonify({

                "success": False,

                "error":
                    "Produit introuvable."

            }), 404

        product_name = (

            product.get(
                "name"
            )

            or
            f"Produit {product_id}"

        )

        # ====================================================
        # 2. VALIDATION UID
        # ====================================================

        validation_payload = {

            "sub_category_id":
                product_id,

            "player_id":
                player_id

        }

        validation_response = requests.post(

            f"{API_URL}"
            "/player/validate",

            headers=get_headers(),

            json=validation_payload,

            timeout=(10, 30)

        )

        validation_result = (
            validation_response.json()
        )

        if (
            validation_response.status_code
            >= 400
        ):

            return jsonify({

                "success": False,

                "error":
                    validation_result.get(
                        "message",
                        "UID invalide."
                    )

            }), 400

        # ====================================================
        # 3. PRIX SHOP2TOPUP ACTUEL
        # ====================================================

        shop_price_usd = (
            get_shop2topup_price(
                product_id
            )
        )

        # ====================================================
        # 4. USD -> MGA
        # ====================================================

        shop_price_mga = round(

            float(shop_price_usd)
            * USD_TO_MGA

        )

        # ====================================================
        # 5. FRAIS FIVEONE
        # ====================================================

        amount_mga, fiveone_fee = (

            calculate_customer_price(
                shop_price_mga
            )
        )

        print(
            f"Prix SHOP2TOPUP : "
            f"${shop_price_usd}",
            flush=True
        )

        print(
            f"Prix SHOP2TOPUP MGA : "
            f"{shop_price_mga} Ar",
            flush=True
        )

        print(
            f"Frais FiveOne : "
            f"{fiveone_fee} Ar",
            flush=True
        )

        print(
            f"TOTAL CLIENT : "
            f"{amount_mga} Ar",
            flush=True
        )

        # ====================================================
        # 6. CRÉER COMMANDE INTERNE
        # ====================================================

        order_id = create_internal_order(

            player_id=
                player_id,

            product_id=
                product_id,

            product_name=
                product_name,

            shop_price_usd=
                shop_price_usd,

            shop_price_mga=
                shop_price_mga,

            fiveone_fee=
                fiveone_fee,

            amount_mga=
                amount_mga

        )

        # ====================================================
        # 7. CRÉER PAIEMENT FIVEONE
        # ====================================================

        payment = (
            create_fiveone_payment(

                order_id,

                amount_mga

            )
        )

        payment_url = (

            payment.get(
                "payment_url"
            )

            or payment.get(
                "checkout_url"
            )

            or payment.get(
                "url"
            )
        )

        if not payment_url:

            raise RuntimeError(

                "FiveOne Pay n'a pas fourni "
                "de lien de paiement."
            )

        return jsonify({

            "success": True,

            "order_id":
                order_id,

            "reference":
                f"LT-{order_id}",

            "shop_price_mga":
                shop_price_mga,

            "fiveone_fee":
                fiveone_fee,

            "amount_mga":
                amount_mga,

            "payment_url":
                payment_url,

            "payment":
                payment

        })

    except requests.RequestException as e:

        return jsonify({

            "success": False,

            "error":
                f"Erreur réseau : {e}"

        }), 500

    except Exception as e:

        print(
            "❌ ERREUR PAYMENT:",
            repr(e),
            flush=True
        )

        return jsonify({

            "success": False,

            "error":
                str(e)

        }), 500


# ============================================================
# SIGNATURE FIVEONE
# ============================================================

def verify_fiveone_signature(

    raw_body,

    received_signature

):

    if not FIVEONE_WEBHOOK_SECRET:

        print(

            "❌ FIVEONE_WEBHOOK_SECRET "
            "absente.",

            flush=True

        )

        return False

    if not received_signature:

        return False

    expected_signature = (

        hmac.new(

            FIVEONE_WEBHOOK_SECRET.encode(
                "utf-8"
            ),

            raw_body,

            hashlib.sha256

        ).hexdigest()

    )

    return hmac.compare_digest(

        expected_signature,

        received_signature

    )


# ============================================================
# CREATION COMMANDE SHOP2TOPUP
# ============================================================

def create_shop2topup_order(
    order_id
):

    conn = get_db()

    order = conn.execute("""

        SELECT *

        FROM orders

        WHERE order_id = ?

    """, (

        order_id,

    )).fetchone()

    conn.close()

    if not order:

        raise RuntimeError(

            "Commande interne introuvable."
        )

    if order[
        "topup_status"
    ] == "COMPLETED":

        print(

            "✓ SHOP2TOPUP déjà exécuté.",

            flush=True

        )

        return order[
            "shop_order_id"
        ]

    product_id = int(
        order[
            "product_id"
        ]
    )

    player_id = order[
        "player_id"
    ]

    expected_price = order[
        "shop_price_usd"
    ]

    # ========================================================
    # Vérifier prix actuel
    # ========================================================

    current_price = (
        get_shop2topup_price(
            product_id
        )
    )

    if (
        float(current_price)
        > float(expected_price)
    ):

        raise RuntimeError(

            "Le prix SHOP2TOPUP a augmenté "
            "depuis le paiement. "

            f"Prix initial : "
            f"{expected_price} USD. "

            f"Prix actuel : "
            f"{current_price} USD."

        )

    # ========================================================
    # COMMANDE SHOP2TOPUP
    # ========================================================

    shop_order_id = order_id

    payload = {

        "order_id":
            shop_order_id,

        "sub_category_id":
            product_id,

        "quantity":
            1,

        "requirements": {

            "player_id":
                player_id,

            "server":
                "MENA"

        },

        "expected_unit_price":
            str(expected_price)

    }

    print(
        "=" * 60,
        flush=True
    )

    print(
        "CREATION COMMANDE SHOP2TOPUP",
        flush=True
    )

    print(
        json.dumps(
            payload,
            indent=2,
            ensure_ascii=False
        ),
        flush=True
    )

    response = requests.post(

        f"{API_URL}/orders/create",

        headers=get_headers(),

        json=payload,

        timeout=(10, 60)

    )

    print(
        "SHOP2TOPUP STATUS:",
        response.status_code,
        flush=True
    )

    print(
        "SHOP2TOPUP RESPONSE:",
        response.text,
        flush=True
    )

    result = response.json()

    if response.status_code >= 400:

        message = (

            result.get(
                "message"
            )

            or result.get(
                "error"
            )

            or
            "SHOP2TOPUP a refusé "
            "la commande."

        )

        raise RuntimeError(
            str(message)
        )

    if not result.get(
        "success",
        True
    ):

        raise RuntimeError(

            result.get(
                "message",
                "SHOP2TOPUP a échoué."
            )
        )

    conn = get_db()

    conn.execute("""

        UPDATE orders

        SET

            topup_status = ?,

            shop_order_id = ?,

            updated_at =
                CURRENT_TIMESTAMP

        WHERE order_id = ?

    """, (

        "COMPLETED",

        shop_order_id,

        order_id

    ))

    conn.commit()

    conn.close()

    return shop_order_id


# ============================================================
# WEBHOOK FIVEONE
# ============================================================

@app.route(
    "/webhooks/fiveonepay",
    methods=["POST"]
)
def fiveone_webhook():

    raw_body = request.get_data()

    signature = request.headers.get(
        "X-FiveOne-Signature"
    )

    print(
        "=" * 60,
        flush=True
    )

    print(
        "WEBHOOK FIVEONE REÇU",
        flush=True
    )

    # ========================================================
    # Vérification signature
    # ========================================================

    if not verify_fiveone_signature(

        raw_body,

        signature

    ):

        print(
            "❌ Signature FiveOne invalide.",
            flush=True
        )

        return jsonify({

            "success": False,

            "error":
                "Invalid signature."

        }), 401

    try:

        event = request.get_json(
            silent=True
        )

        if not event:

            return jsonify({

                "success": False,

                "error":
                    "JSON invalide."

            }), 400

        print(

            json.dumps(

                event,

                indent=2,

                ensure_ascii=False

            ),

            flush=True

        )

        # ====================================================
        # EVENT ID
        # ====================================================

        event_id = str(

            event.get(
                "id"
            )

            or event.get(
                "event_id"
            )

            or hashlib.sha256(
                raw_body
            ).hexdigest()

        )

        event_type = str(

            event.get(
                "type"
            )

            or event.get(
                "event"
            )

            or ""

        )

        data = (

            event.get(
                "data"
            )

            or event.get(
                "payment"
            )

            or {}

        )

        reference = (

            data.get(
                "reference"
            )

            or event.get(
                "reference"
            )

        )

        # ====================================================
        # IDEMPOTENCE WEBHOOK
        # ====================================================

        conn = get_db()

        existing = conn.execute("""

            SELECT *

            FROM webhook_events

            WHERE event_id = ?

        """, (

            event_id,

        )).fetchone()

        if (
            existing
            and existing[
                "processed"
            ] == 1
        ):

            conn.close()

            return jsonify({

                "success":
                    True,

                "message":
                    "Already processed."

            }), 200

        if not existing:

            conn.execute("""

                INSERT INTO webhook_events (

                    event_id,

                    event_type,

                    processed

                )

                VALUES (?, ?, 0)

            """, (

                event_id,

                event_type

            ))

            conn.commit()

        conn.close()

        # ====================================================
        # REFERENCE
        # ====================================================

        if not reference:

            raise RuntimeError(

                "Référence FiveOne absente."
            )

        conn = get_db()

        order = conn.execute("""

            SELECT *

            FROM orders

            WHERE payment_reference = ?

        """, (

            reference,

        )).fetchone()

        conn.close()

        if not order:

            raise RuntimeError(

                f"Commande introuvable "
                f"pour référence {reference}"
            )

        order_id = order[
            "order_id"
        ]

        # ====================================================
        # MONTANT
        # ====================================================

        webhook_amount = (

            data.get(
                "amount"
            )

            or event.get(
                "amount"
            )

        )

        if webhook_amount is not None:

            if int(
                float(
                    webhook_amount
                )
            ) != int(
                order[
                    "amount_mga"
                ]
            ):

                raise RuntimeError(

                    "Montant FiveOne incorrect. "

                    f"Attendu : "
                    f"{order['amount_mga']} MGA. "

                    f"Reçu : "
                    f"{webhook_amount} MGA."

                )

        # ====================================================
        # PAYMENT SUCCESS
        # ====================================================

        if event_type == (
            "payment.success"
        ):

            conn = get_db()

            conn.execute("""

                UPDATE orders

                SET

                    payment_status = ?,

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE order_id = ?

            """, (

                "SUCCESS",

                order_id

            ))

            conn.commit()

            conn.close()

            # =================================================
            # TOPUP SHOP2TOPUP
            # =================================================

            try:

                shop_order_id = (
                    create_shop2topup_order(
                        order_id
                    )
                )

                conn = get_db()

                conn.execute("""

                    UPDATE webhook_events

                    SET

                        processed = 1

                    WHERE event_id = ?

                """, (

                    event_id,

                ))

                conn.commit()

                conn.close()

                print(
                    "✓ PAIEMENT CONFIRMÉ",
                    flush=True
                )

                print(
                    "✓ TOPUP SHOP2TOPUP CRÉÉ",
                    flush=True
                )

                return jsonify({

                    "success":
                        True,

                    "order_id":
                        order_id,

                    "shop_order_id":
                        shop_order_id

                }), 200

            except Exception as e:

                print(

                    "❌ ERREUR TOPUP:",

                    repr(e),

                    flush=True

                )

                conn = get_db()

                conn.execute("""

                    UPDATE orders

                    SET

                        topup_status = ?,

                        updated_at =
                            CURRENT_TIMESTAMP

                    WHERE order_id = ?

                """, (

                    "FAILED",

                    order_id

                ))

                conn.commit()

                conn.close()

                return jsonify({

                    "success":
                        False,

                    "error":
                        str(e)

                }), 500

        # ====================================================
        # PAYMENT EXPIRED
        # ====================================================

        if event_type == (
            "payment.expired"
        ):

            conn = get_db()

            conn.execute("""

                UPDATE orders

                SET

                    payment_status = ?,

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE order_id = ?

                AND payment_status != 'SUCCESS'

            """, (

                "EXPIRED",

                order_id

            ))

            conn.execute("""

                UPDATE webhook_events

                SET

                    processed = 1

                WHERE event_id = ?

            """, (

                event_id,

            ))

            conn.commit()

            conn.close()

            return jsonify({

                "success":
                    True

            }), 200

        # ====================================================
        # AUTRES EVENTS
        # ====================================================

        conn = get_db()

        conn.execute("""

            UPDATE webhook_events

            SET

                processed = 1

            WHERE event_id = ?

        """, (

            event_id,

        ))

        conn.commit()

        conn.close()

        return jsonify({

            "success":
                True

        }), 200

    except Exception as e:

        print(

            "❌ ERREUR WEBHOOK:",

            repr(e),

            flush=True

        )

        return jsonify({

            "success":
                False,

            "error":
                str(e)

        }), 500


# ============================================================
# STATUT COMMANDE
# ============================================================

@app.route(
    "/api/order/<order_id>",
    methods=["GET"]
)
def order_status(
    order_id
):

    try:

        conn = get_db()

        order = conn.execute("""

            SELECT *

            FROM orders

            WHERE order_id = ?

        """, (

            order_id,

        )).fetchone()

        conn.close()

        if not order:

            return jsonify({

                "success":
                    False,

                "error":
                    "Commande introuvable."

            }), 404

        return jsonify({

            "success":
                True,

            "order":
                dict(order),

            "payment_status":
                order[
                    "payment_status"
                ],

            "topup_status":
                order[
                    "topup_status"
                ],

            "shop_price_mga":
                order[
                    "shop_price_mga"
                ],

            "fiveone_fee":
                order[
                    "fiveone_fee_mga"
                ],

            "amount_mga":
                order[
                    "amount_mga"
                ]

        })

    except Exception as e:

        return jsonify({

            "success":
                False,

            "error":
                str(e)

        }), 500


# ============================================================
# COMPTE SHOP2TOPUP
# ============================================================

@app.route(
    "/api/account"
)
def account():

    try:

        response = requests.get(

            f"{API_URL}/account",

            headers=get_headers(),

            timeout=(10, 30)

        )

        return jsonify(
            response.json()
        ), response.status_code

    except requests.RequestException as e:

        return jsonify({

            "success":
                False,

            "error":
                str(e)

        }), 500


# ============================================================
# HEALTH
# ============================================================

@app.route(
    "/api/health"
)
def health():

    return jsonify({

        "success":
            True,

        "service":
            "Libre Topup",

        "shop2topup":
            bool(API_KEY),

        "fiveone":
            bool(FIVEONE_SECRET_KEY),

        "webhook":
            bool(FIVEONE_WEBHOOK_SECRET),

        "usd_to_mga":
            USD_TO_MGA,

        "fiveone_fee_percent":
            FIVEONE_FEE_PERCENT,

        "fiveone_fee_min":
            FIVEONE_FEE_MIN,

        "fiveone_fee_max":
            FIVEONE_FEE_MAX

    })


# ============================================================
# INITIALISATION
# ============================================================

init_db()


# ============================================================
# START
# ============================================================

if __name__ == "__main__":

    print(
        "=" * 60,
        flush=True
    )

    print(
        "LIBRE TOPUP",
        flush=True
    )

    print(
        "FREE FIRE MENA",
        flush=True
    )

    print(
        "=" * 60,
        flush=True
    )

    print(
        "SHOP2TOPUP :",
        "✓" if API_KEY else "❌",
        flush=True
    )

    print(
        "FIVEONE :",
        "✓" if FIVEONE_SECRET_KEY else "❌",
        flush=True
    )

    print(
        "WEBHOOK :",
        "✓" if FIVEONE_WEBHOOK_SECRET else "❌",
        flush=True
    )

    print(
        "Taux USD/MGA :",
        USD_TO_MGA,
        flush=True
    )

    print(
        "Frais FiveOne :",
        f"{FIVEONE_FEE_PERCENT}%",
        flush=True
    )

    print(
        "Frais minimum :",
        f"{FIVEONE_FEE_MIN} Ar",
        flush=True
    )

    print(
        "Frais maximum :",
        f"{FIVEONE_FEE_MAX} Ar",
        flush=True
    )

    print(
        "Serveur :",
        "http://127.0.0.1:5000",
        flush=True
    )

    print(
        "=" * 60,
        flush=True
    )

    app.run(

        host="127.0.0.1",

        port=5000,

        debug=True

    )