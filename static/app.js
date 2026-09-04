// ============================================================
// LIBRE TOPUP
// Free Fire MENA
// SHOP2TOPUP + FIVEONE PAY
// ============================================================

let player = null;
let selectedProduct = null;
let currentOrderId = null;


// ============================================================
// UTILITAIRES
// ============================================================

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


// ============================================================
// ELEMENTS HTML
// ============================================================

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


// Vérification de sécurité
console.log("LIBRE TOPUP JS chargé.");


// ============================================================
// CHARGER LES PRODUITS SHOP2TOPUP
// ============================================================

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


            /*
             * Le prix MGA affiché vient du backend.
             * Si le backend renvoie déjà un prix MGA,
             * on l'utilise.
             *
             * Sinon on convertit avec 4600.
             */

            let priceMGA;

            if (product.price_mga !== undefined) {

                priceMGA =
                    Number(product.price_mga);

            } else {

                priceMGA =
                    Math.round(
                        priceUSD * 4600
                    );
            }


            card.innerHTML = `

                <div class="product-name">
                    ${escapeHtml(product.name)}
                </div>

                <div class="product-price">
                    ${formatMGA(priceMGA)}
                </div>

                <div class="product-usd">
                    ${formatUSD(priceUSD)}
                </div>

                <div class="product-id">
                    ID : ${escapeHtml(product.id)}
                </div>

            `;


            // =================================================
            // SELECTION DU PRODUIT
            // =================================================

            card.addEventListener(
                "click",
                () => {

                    // Retirer sélection précédente

                    document
                        .querySelectorAll(".product")
                        .forEach(element => {

                            element.classList.remove(
                                "selected"
                            );

                        });


                    // Sélection actuelle

                    card.classList.add(
                        "selected"
                    );


                    selectedProduct =
                        product;


                    console.log(
                        "Produit sélectionné :",
                        selectedProduct
                    );


                    updateSummary();

                }
            );


            productsContainer.appendChild(
                card
            );

        });


    } catch (error) {

        console.error(
            "Erreur chargement produits :",
            error
        );


        productsContainer.innerHTML = `

            <div class="player-error">

                ❌ ${escapeHtml(
                    error.message
                )}

            </div>

        `;
    }
}


// ============================================================
// VALIDATION UID
// ============================================================

async function validateUID() {

    const uid =
        uidInput.value.trim();


    // --------------------------------------------------------
    // Vérification locale
    // --------------------------------------------------------

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

    validateBtn.textContent =
        "Vérification...";


    validationResult.innerHTML = `

        <div class="loading">

            Vérification du joueur...

        </div>

    `;


    try {

        /*
         * Si aucun produit n'est encore sélectionné,
         * on utilise 28 comme produit de validation.
         */

        const productId =
            selectedProduct
                ? selectedProduct.id
                : 28;


        const response =
            await fetch(
                "/api/validate",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        player_id:
                            uid,

                        product_id:
                            productId

                    })
                }
            );


        const data =
            await response.json();


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


        // =====================================================
        // RECUPERATION DES DONNEES JOUEUR
        // =====================================================

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

            nickname:
                nickname,

            region:
                region

        };


        // =====================================================
        // AFFICHAGE RESULTAT
        // =====================================================

        validationResult.innerHTML = `

            <div class="player-success">

                <strong>
                    ✓ Joueur trouvé
                </strong>

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

                ❌ ${escapeHtml(
                    error.message
                )}

            </div>

        `;


        updateSummary();


    } finally {

        validateBtn.disabled =
            false;

        validateBtn.textContent =
            "Vérifier";

    }
}


// ============================================================
// AFFICHER LE RESUME
// ============================================================

function updateSummary() {

    console.log(
        "updateSummary()",
        {
            player: player,
            selectedProduct: selectedProduct
        }
    );


    /*
     * Pas encore de joueur :
     * on cache le résumé.
     */

    if (!player) {

        orderCard.style.display =
            "none";

        topupBtn.disabled =
            true;

        return;
    }


    /*
     * Pas encore de produit :
     * on cache également le résumé.
     */

    if (!selectedProduct) {

        orderCard.style.display =
            "none";

        topupBtn.disabled =
            true;

        return;
    }


    // ========================================================
    // LES DEUX SONT PRESENTS
    // ========================================================

    orderCard.style.display =
        "block";


    const priceUSD =
        Number(
            selectedProduct.price
        );


    let priceMGA;


    if (
        selectedProduct.price_mga !== undefined
    ) {

        priceMGA =
            Number(
                selectedProduct.price_mga
            );

    } else {

        priceMGA =
            Math.round(
                priceUSD * 4600
            );

    }


    // ========================================================
    // REMPLIR LE RESUME
    // ========================================================

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
        "summaryPrice"
    ).textContent =
        formatMGA(priceMGA);


    // ========================================================
    // ACTIVER LE BOUTON PAIEMENT
    // ========================================================

    topupBtn.disabled =
        false;


    topupBtn.style.display =
        "block";


    topupBtn.textContent =
        "PAYER AVEC FIVEONE PAY";


    console.log(
        "Bouton paiement activé."
    );
}


// ============================================================
// CREER LE PAIEMENT FIVEONE PAY
// ============================================================

async function createPayment() {

    console.log(
        "Création paiement..."
    );


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


    topupBtn.disabled =
        true;


    topupBtn.textContent =
        "Création du paiement...";


    paymentResult.innerHTML = `

        <div class="loading">

            Préparation du paiement sécurisé...

        </div>

    `;


    try {

        const response =
            await fetch(
                "/api/payment",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        player_id:
                            player.uid,

                        product_id:
                            selectedProduct.id

                    })
                }
            );


        const data =
            await response.json();


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


        // =====================================================
        // REFERENCE COMMANDE
        // =====================================================

        currentOrderId =
            data.order_id ||
            data.reference ||
            null;


        // =====================================================
        // URL PAIEMENT
        // =====================================================

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


        // =====================================================
        // REDIRECTION
        // =====================================================

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

                ❌ ${escapeHtml(
                    error.message
                )}

            </div>

        `;


        topupBtn.disabled =
            false;


        topupBtn.textContent =
            "PAYER AVEC FIVEONE PAY";
    }
}


// ============================================================
// VERIFICATION STATUT COMMANDE
// ============================================================

async function checkOrderStatus(orderId) {

    if (!orderId) {
        return;
    }


    statusCard.style.display =
        "block";


    orderStatus.innerHTML = `

        <div class="loading">

            Vérification du paiement...

        </div>

    `;


    try {

        const response =
            await fetch(
                `/api/order/${encodeURIComponent(
                    orderId
                )}`,
                {
                    method: "GET",
                    cache: "no-store"
                }
            );


        const data =
            await response.json();


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


        // =====================================================
        // TOPUP REUSSI
        // =====================================================

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


        // =====================================================
        // TOPUP EN COURS
        // =====================================================

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


        // =====================================================
        // PAIEMENT REUSSI
        // =====================================================

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


        // =====================================================
        // PAIEMENT EN ATTENTE
        // =====================================================

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


        // =====================================================
        // PAIEMENT EXPIRE
        // =====================================================

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


        // =====================================================
        // ERREUR TOPUP
        // =====================================================

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


        // =====================================================
        // STATUT INCONNU
        // =====================================================

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

                ❌ ${escapeHtml(
                    error.message
                )}

            </div>

        `;
    }
}


// ============================================================
// RETOUR FIVEONE PAY
// ============================================================

function checkPaymentReturn() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    const payment =
        params.get("payment");


    const orderId =
        params.get("order_id");


    /*
     * Aucun retour de paiement.
     */

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


    checkOrderStatus(
        orderId
    );


    // ========================================================
    // POLLING
    // ========================================================

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


// ============================================================
// EVENEMENTS
// ============================================================

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


// ============================================================
// INITIALISATION
// ============================================================

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