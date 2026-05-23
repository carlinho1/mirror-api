const axios = require("axios");
const pool = require("./db");

async function syncProducts() {

    const activeProductIds = [];

    // COLECCIONES
    const collections = [
        "puma",
        "mens-sneakers",
        "puma-sneakers"
    ];

    // EVITAR DUPLICADOS
    const processedProducts = new Set();

    for (const collection of collections) {

        let page = 1;

        while (true) {

            try {

                const url = `https://www.shoebacca.com/collections/${collection}/products.json?limit=200&page=${page}`;

                console.log("Fetching:", url);

                const response = await axios.get(url, {

                    timeout: 30000,

                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
                        "Accept": "application/json"
                    }
                });

                const products = response.data.products;

                if (!products || products.length === 0) {

                    console.log(`No more products in ${collection}`);

                    break;
                }

                for (const product of products) {

                    // EVITAR DUPLICADOS
                    if (processedProducts.has(product.id)) {
                        continue;
                    }

                    processedProducts.add(product.id);

                    // SOLO SNEAKERS Y ATHLETIC
                    if (
                        product.product_type !== "Sneakers" &&
                        product.product_type !== "Athletic"
                    ) {
                        continue;
                    }

                    if (
                        collection === "mens-sneakers" &&
                        product.vendor !== "PUMA"
                    ) {
                        continue;
                    }

                    // ELIMINAR KIDS
                    
                    const tags = product.tags.map(
                        t => t.toLowerCase()
                    );
                    
                    if (
                        tags.includes("kids") ||
                        tags.includes("kid")
                    ) {
                        continue;
                    }

                    // if (product.tags.includes("Kids")) {
                    //     continue;
                    // }

                    // SOLO PRODUCTOS CON STOCK

                    const availableVariants = product.variants.filter(
                        v => v.available
                    );

                    if (availableVariants.length === 0) {
                        continue;
}

                    // MAX 45 USD
                    const price = Number(
                        product.variants?.[0]?.price || 0
                    );

                    if (price > 45) {
                        continue;
                    }

                    // PRECIO MÁS BAJO
                    const minPrice = Math.min(
                        ...product.variants.map(v =>
                            parseFloat(v.price)
                        )
                    );

                    // DETECTAR GÉNERO
                    let gender = "Unisex";

                    // if (product.tags.includes("Mens")) {
                    //     gender = "Hombre";
                    // }
                    // else if (product.tags.includes("Womens")) {
                    //     gender = "Mujer";
                    // }

                    if (tags.includes("mens")) {
                        gender = "Hombre";
                    }
                    else if (tags.includes("womens")) {
                        gender = "Mujer";
                    }

                    activeProductIds.push(product.id);

                    // INSERT PRODUCT
                    // await pool.query(
                    //     `
                    //     INSERT INTO products
                    //     (
                    //         id,
                    //         title,
                    //         handle,
                    //         vendor,
                    //         product_type,
                    //         price,
                    //         image,
                    //         body_html,
                    //         gender,
                    //         created_at,
                    //         updated_at
                    //     )
                    //     VALUES
                    //     ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)

                    //     ON CONFLICT (id)
                    //     DO UPDATE SET
                    //         title = EXCLUDED.title,
                    //         price = EXCLUDED.price,
                    //         gender = EXCLUDED.gender,
                    //         updated_at = EXCLUDED.updated_at
                    //     `,
                    //     [
                    //         product.id,
                    //         product.title,
                    //         product.handle,
                    //         product.vendor,
                    //         product.product_type,
                    //         minPrice,
                    //         product.images?.[0]?.src || null,
                    //         product.body_html,
                    //         gender,
                    //         product.created_at,
                    //         product.updated_at
                    //     ]
                    // );

                    await pool.query(
`
INSERT INTO products
(
    id,
    title,
    handle,
    vendor,
    product_type,
    price,
    image,
    body_html,
    gender,
    tags,
    created_at,
    updated_at
)
VALUES
(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
)

ON CONFLICT (id)
DO UPDATE SET
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    gender = EXCLUDED.gender,
    tags = EXCLUDED.tags,
    updated_at = EXCLUDED.updated_at
`,
[
    product.id,
    product.title,
    product.handle,
    product.vendor,
    product.product_type,
    minPrice,
    product.images?.[0]?.src || null,
    product.body_html,
    gender,
    product.tags, // ← aquí
    product.created_at,
    product.updated_at
]
);

                    // INSERT VARIANTS
                    for (const variant of product.variants) {

                        await pool.query(
                            `
                            INSERT INTO product_variants
                            (
                                id,
                                product_id,
                                title,
                                price,
                                sku,
                                available
                            )
                            VALUES
                            ($1,$2,$3,$4,$5,$6)

                            ON CONFLICT (id)
                            DO UPDATE SET
                                available = EXCLUDED.available,
                                price = EXCLUDED.price
                            `,
                            [
                                variant.id,
                                product.id,
                                variant.option1,
                                variant.price,
                                variant.sku,
                                variant.available
                            ]
                        );
                    }

                    console.log("Saved:", product.title);
                }

                await new Promise(resolve =>
                    setTimeout(resolve, 2000)
                );

                page++;

            // } catch (error) {

            //     console.log("ERROR:");
            //     console.log(error.message);

            //     break;
            
            //}

            } catch (error) {

                console.log("ERROR:");
                console.log(error.message);

                console.log("Retrying in 5 seconds...");

                await new Promise(resolve =>
                    setTimeout(resolve, 5000)
                );

                continue;
            }



        }
    }


        console.log(
            `Active products: ${activeProductIds.length}`
        );

    if (activeProductIds.length > 0) {


    const deletedVariants = await pool.query(
        `
        DELETE FROM product_variants
        WHERE product_id NOT IN (${activeProductIds.join(",")})
        `
    );

    const deletedProducts = await pool.query(
        `
        DELETE FROM products
        WHERE id NOT IN (${activeProductIds.join(",")})
        `
    );

    console.log(
        `Deleted variants: ${deletedVariants.rowCount}`
    );

    console.log(
        `Deleted products: ${deletedProducts.rowCount}`
    );


    // await pool.query(
    //     `
    //     DELETE FROM product_variants
    //     WHERE product_id NOT IN (${activeProductIds.join(",")})
    //     `
    // );

    // await pool.query(
    //     `
    //     DELETE FROM products
    //     WHERE id NOT IN (${activeProductIds.join(",")})
    //     `
    // );

    // console.log("Old products deleted");
}


    // await pool.query(
    // `
    //     DELETE FROM product_variants
    //     WHERE product_id NOT IN (${activeProductIds.join(",")})
    //     `
    // );

    // await pool.query(
    //     `
    //     DELETE FROM products
    //     WHERE id NOT IN (${activeProductIds.join(",")})
    //     `
    // );

    // console.log("Old products deleted");    


    console.log("SYNC COMPLETE");
}

syncProducts();