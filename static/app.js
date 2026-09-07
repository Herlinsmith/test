let player = null;
let selectedProduct = null;
let currentOrderId = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatMGA(amount) {
    return Number(amount).toLocaleString("fr-FR") + " Ar";
}

function formatUSD(amount) {
    return "$" + Number(amount).toFixed(6);
}

const uidInput = document.getElementById("uid");
const validateBtn = document.getElementById("validateBtn");
const validationResult = document.getElementById("validationResult");

const productsContainer = document.getElementById("products");
const refreshBtn = document.getElementById("refreshBtn");

const orderCard = document.getElementById("orderCard");
const topupBtn = document.getElementById("topupBtn");
const paymentResult = document.getElementById("paymentResult");

const statusCard = document.getElementById("statusCard");
const orderStatus = document.getElementById("orderStatus");

console.log("LIBRE TOPUP JS chargé.");

async function loadProducts() {

    productsContainer.innerHTML = `
        <div class="loading">
            Chargement des offres...
        </div>
    `;

    try {

        const response = await fetch(
            "/api/products",
            {
                method: "GET",
                cache: "no-store"
            }
        );

        const data = await response.json();

        console.log("Produits SHOP2TOPUP :", data);

        if (!response.ok || data.success !== true) {
            throw new Error(
                data.error ||
                data.message ||
                "Impossible de charger les offres."
            );
        }

        const products = data.products;

        if (!Array.isArray(products) || products.length === 0) {

            productsContainer.innerHTML = `
                <div class="loading">
                    Aucune offre disponible.
                </div>
            `;

            return;
        }

        productsContainer.innerHTML = "";

        products.forEach(product => {

            const card = document.createElement("div");

            card.className = "product";

            const priceUSD = Number(product.price);

            const priceMGA =
                product.price_mga !== undefined
                    ? Number(product.price_mga)
                    : Math.round(priceUSD * 4600);

            const fiveoneFee =
                product.fiveone_fee !== undefined
                    ? Number(product.fiveone_fee)
                    : 0;

            const finalPrice =
                product.final_price_mga !== undefined
                    ? Number(product.final_price_mga)
                    : priceMGA + fiveoneFee;

            card.innerHTML = `

                <div class="product-name">
                    ${escapeHtml(product.name)}
                </div>

                <div class="product-price">
                    ${formatMGA(finalPrice)}
                </div>

                <div class="product-usd">
                    ${formatUSD(priceUSD)}
                </div>

                <div class="product-id">
                    ID : ${escapeHtml(product.id)}
                </div>

            `;

            card.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(".product")
                        .forEach(element => {
                            element.classList.remove("selected");
                        });

                    card.classList.add("selected");

                    selectedProduct = product;

                    console.log(
                        "Produit sélectionné :",
                        selectedProduct
                    );

                    updateSummary();
                }
            );

            productsContainer.appendChild(card);
        });

    } catch (error) {

        console.error(
            "Erreur chargement produits :",
            error
        );

        productsContainer.innerHTML = `

            <div class="player-error">

                ❌ ${escapeHtml(error.message)}

            </div>

        `;
    }
}

async function validateUID() {

    const uid = uidInput.value.trim();

    if (!uid) {

        validationResult.innerHTML = `

            <div class="player-error">
                ❌ Entre ton UID Free Fire.
            </div>

        `;

        return;
    }

    if (!/^\d{5,20}$/.test(uid)) {

        validationResult.innerHTML = `

            <div class="player-error">
                ❌ UID Free Fire invalide.
            </div>

        `;

        return;
    }

    validateBtn.disabled = true;
    validateBtn.textContent = "Vérification...";

    validationResult.innerHTML = `

        <div class="loading">
            Vérification du joueur...
        </div>

    `;

    try {

        const productId =
            selectedProduct
                ? selectedProduct.id
                : 28;

        const response = await fetch(
            "/api/validate",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    player_id: uid,
                    product_id: productId
                })
            }
        );

        const data = await response.json();

        console.log(
            "Réponse validation :",
            data
        );

        if (
            !response.ok ||
            data.success === false
        ) {

            throw new Error(
                data.error ||
                data.message ||
                "UID introuvable."
            );
        }

        const playerData =
            data.player ||
            data.data ||
            data;

        const nickname =
            playerData.nickname ||
            playerData.player_name ||
            playerData.playerName ||
            playerData.name ||
            playerData.username ||
            "Pseudo trouvé";

        const region =
            playerData.region ||
            playerData.region_name ||
            playerData.server ||
            "MENA";

        player = {
            uid: uid,
            nickname: nickname,
            region: region
        };

        validationResult.innerHTML = `

            <div class="player-success">

                <strong>✓ Joueur trouvé</strong>

                <br><br>

                👤 Pseudo :
                <strong>
                    ${escapeHtml(nickname)}
                </strong>

                <br>

                🆔 UID :
                ${escapeHtml(uid)}

                <br>

                🌍 Région :
                ${escapeHtml(region)}

            </div>

        `;

        updateSummary();

    } catch (error) {

        console.error(
            "Erreur validation UID :",
            error
        );

        player = null;

        validationResult.innerHTML = `

            <div class="player-error">

                ❌ ${escapeHtml(error.message)}

            </div>

        `;

        updateSummary();

    } finally {

        validateBtn.disabled = false;
        validateBtn.textContent = "Vérifier";
    }
}

function updateSummary() {

    console.log(
        "updateSummary()",
        {
            player: player,
            selectedProduct: selectedProduct
        }
    );

    if (!player || !selectedProduct) {

        orderCard.style.display = "none";
        topupBtn.disabled = true;

        return;
    }

    orderCard.style.display = "block";

    const priceUSD =
        Number(selectedProduct.price);

    const priceMGA =
        selectedProduct.price_mga !== undefined
            ? Number(selectedProduct.price_mga)
            : Math.round(priceUSD * 4600);

    const fiveoneFee =
        selectedProduct.fiveone_fee !== undefined
            ? Number(selectedProduct.fiveone_fee)
            : 0;

    const finalPrice =
        selectedProduct.final_price_mga !== undefined
            ? Number(selectedProduct.final_price_mga)
            : priceMGA + fiveoneFee;

    document.getElementById(
        "summaryUid"
    ).textContent =
        player.uid;

    document.getElementById(
        "summaryPlayer"
    ).textContent =
        player.nickname;

    document.getElementById(
        "summaryRegion"
    ).textContent =
        player.region || "MENA";

    document.getElementById(
        "summaryProduct"
    ).textContent =
        selectedProduct.name;

    document.getElementById(
        "summaryUsd"
    ).textContent =
        formatUSD(priceUSD);

    document.getElementById(
        "summaryBasePrice"
    ).textContent =
        formatMGA(priceMGA);

    document.getElementById(
        "summaryFiveOneFee"
    ).textContent =
        formatMGA(fiveoneFee);

    document.getElementById(
        "summaryPrice"
    ).textContent =
        formatMGA(finalPrice);

    topupBtn.disabled = false;
    topupBtn.style.display = "block";
    topupBtn.textContent = "PAYER AVEC FIVEONE PAY";

    console.log(
        "Prix fournisseur :",
        priceMGA
    );

    console.log(
        "Frais FiveOne :",
        fiveoneFee
    );

    console.log(
        "Prix final :",
        finalPrice
    );
}

async function createPayment() {

    console.log("Création paiement...");

    if (!player) {

        paymentResult.innerHTML = `

            <div class="player-error">
                ❌ Vérifie d'abord ton UID.
            </div>

        `;

        return;
    }

    if (!selectedProduct) {

        paymentResult.innerHTML = `

            <div class="player-error">
                ❌ Sélectionne une offre.
            </div>

        `;

        return;
    }

    topupBtn.disabled = true;
    topupBtn.textContent = "Création du paiement...";

    paymentResult.innerHTML = `

        <div class="loading">
            Préparation du paiement sécurisé...
        </div>

    `;

    try {

        const response = await fetch(
            "/api/payment",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({

                    player_id:
                        player.uid,

                    product_id:
                        selectedProduct.id

                })
            }
        );

        const data = await response.json();

        console.log(
            "Réponse FiveOne :",
            data
        );

        if (
            !response.ok ||
            data.success !== true
        ) {

            throw new Error(
                data.error ||
                data.message ||
                "Impossible de créer le paiement."
            );
        }

        currentOrderId =
            data.order_id ||
            data.reference ||
            null;

        const paymentUrl =
            data.payment_url;

        if (!paymentUrl) {

            throw new Error(
                "FiveOne Pay n'a pas fourni de lien de paiement."
            );
        }

        paymentResult.innerHTML = `

            <div class="player-success">

                ✓ Paiement créé.

                <br><br>

                Redirection vers
                <strong>FiveOne Pay</strong>...

            </div>

        `;

        setTimeout(
            () => {

                window.location.href =
                    paymentUrl;

            },
            500
        );

    } catch (error) {

        console.error(
            "Erreur paiement :",
            error
        );

        paymentResult.innerHTML = `

            <div class="player-error">

                ❌ ${escapeHtml(error.message)}

            </div>

        `;

        topupBtn.disabled = false;

        topupBtn.textContent =
            "PAYER AVEC FIVEONE PAY";
    }
}

async function checkOrderStatus(orderId) {

    if (!orderId) {
        return;
    }

    statusCard.style.display = "block";

    orderStatus.innerHTML = `

        <div class="loading">
            Vérification du paiement...
        </div>

    `;

    try {

        const response = await fetch(
            `/api/order/${encodeURIComponent(orderId)}`,
            {
                method: "GET",
                cache: "no-store"
            }
        );

        const data = await response.json();

        console.log(
            "Statut commande :",
            data
        );

        if (
            !response.ok ||
            data.success === false
        ) {

            throw new Error(
                data.error ||
                data.message ||
                "Impossible de récupérer le statut."
            );
        }

        const paymentStatus =
            String(
                data.payment_status ||
                data.status ||
                ""
            ).toUpperCase();

        const topupStatus =
            String(
                data.topup_status ||
                ""
            ).toUpperCase();

        if (
            topupStatus === "SUCCESS" ||
            topupStatus === "COMPLETED"
        ) {

            orderStatus.innerHTML = `

                <div class="player-success">

                    <strong>
                        ✅ Recharge effectuée !
                    </strong>

                    <br><br>

                    La recharge a été envoyée
                    automatiquement sur ton compte
                    Free Fire.

                </div>

            `;

            return;
        }

        if (
            topupStatus === "PROCESSING"
        ) {

            orderStatus.innerHTML = `

                <div class="loading">

                    ⏳ Paiement confirmé.

                    <br><br>

                    Recharge Free Fire en cours...

                </div>

            `;

            return;
        }

        if (
            paymentStatus === "SUCCESS"
        ) {

            orderStatus.innerHTML = `

                <div class="loading">

                    ✓ Paiement confirmé.

                    <br><br>

                    Traitement de la recharge...

                </div>

            `;

            return;
        }

        if (
            paymentStatus === "PENDING"
        ) {

            orderStatus.innerHTML = `

                <div class="loading">

                    ⏳ Paiement en attente.

                    <br><br>

                    Termine le paiement sur
                    FiveOne Pay.

                </div>

            `;

            return;
        }

        if (
            paymentStatus === "EXPIRED"
        ) {

            orderStatus.innerHTML = `

                <div class="player-error">

                    ❌ Le paiement a expiré.

                    <br><br>

                    Tu peux recommencer
                    une nouvelle commande.

                </div>

            `;

            return;
        }

        if (
            topupStatus.includes("FAILED")
        ) {

            orderStatus.innerHTML = `

                <div class="player-error">

                    ⚠️ Le paiement a été reçu,
                    mais la recharge nécessite
                    une vérification.

                </div>

            `;

            return;
        }

        orderStatus.innerHTML = `

            <div class="loading">

                Statut :

                <strong>
                    ${escapeHtml(
                        paymentStatus ||
                        topupStatus ||
                        "INCONNU"
                    )}
                </strong>

            </div>

        `;

    } catch (error) {

        console.error(
            "Erreur statut commande :",
            error
        );

        orderStatus.innerHTML = `

            <div class="player-error">

                ❌ ${escapeHtml(error.message)}

            </div>

        `;
    }
}

function checkPaymentReturn() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const payment =
        params.get("payment");

    const orderId =
        params.get("order_id");

    if (!orderId) {
        return;
    }

    currentOrderId =
        orderId;

    statusCard.style.display =
        "block";

    if (
        payment === "success"
    ) {

        orderStatus.innerHTML = `

            <div class="loading">

                ✓ Paiement terminé.

                <br><br>

                Vérification de la recharge...

            </div>

        `;

    } else {

        orderStatus.innerHTML = `

            <div class="loading">

                Vérification de la commande...

            </div>

        `;
    }

    checkOrderStatus(orderId);

    let attempts = 0;
    const maxAttempts = 20;

    const interval =
        setInterval(
            async () => {

                attempts++;

                await checkOrderStatus(
                    orderId
                );

                if (
                    attempts >= maxAttempts
                ) {

                    clearInterval(
                        interval
                    );

                }

            },
            3000
        );
}

validateBtn.addEventListener(
    "click",
    validateUID
);

refreshBtn.addEventListener(
    "click",
    loadProducts
);

topupBtn.addEventListener(
    "click",
    createPayment
);

uidInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter"
        ) {

            validateUID();

        }

    }
);

document.addEventListener(
    "DOMContentLoaded",
    () => {

        console.log(
            "Libre Topup initialisation..."
        );

        loadProducts();

        checkPaymentReturn();

    }
);