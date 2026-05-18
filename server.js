const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

app.use(cors());


// TRM MANUAL
const TRM = 3800;


// ROOT
app.get("/", (req, res) => {

    res.send("API running");
});


// PRODUCTS WITH FILTERS + INFINITE SCROLL
app.get("/products", async (req, res) => {

    try {

        const page = parseInt(req.query.page) || 1;

        const limit = 40;

        const offset = (page - 1) * limit;

        const gender = req.query.gender || "";

        const size = req.query.size || "";

        let whereClauses = [];

        let values = [];

        let paramCount = 1;


        // FILTER GENDER

        if (gender) {

            whereClauses.push(
                `p.gender = $${paramCount}`
            );

            values.push(gender);

            paramCount++;
        }


        // FILTER SIZE

        if (size) {

            whereClauses.push(`
                EXISTS (
                    SELECT 1
                    FROM product_variants pv2
                    WHERE pv2.product_id = p.id
                    AND pv2.title = $${paramCount}
                    AND pv2.available = true
                )
            `);

            values.push(size);

            paramCount++;
        }


        // BUILD WHERE

        const whereSQL = whereClauses.length
            ? `WHERE ${whereClauses.join(" AND ")}`
            : "";


        // PAGINATION VALUES

        values.push(limit);

        values.push(offset);


        // QUERY

        const result = await pool.query(
            `
            SELECT
                p.*,

                COALESCE(
                    json_agg(
                        json_build_object(
                            'size', pv.title,
                            'available', pv.available
                        )
                    ) FILTER (WHERE pv.id IS NOT NULL),
                    '[]'
                ) as variants

            FROM products p

            LEFT JOIN product_variants pv
                ON pv.product_id = p.id

            ${whereSQL}

            GROUP BY p.id

            ORDER BY p.price ASC

            LIMIT $${paramCount}
            OFFSET $${paramCount + 1}
            `,
            values
        );


        // CALCULATE COP PRICE

        const products = result.rows.map(product => {

            const usd = Number(product.price || 0);

            const cop = ((usd * 1.5) + 20) * TRM;

            return {

                ...product,

                price_cop: Math.round(cop)
            };
        });


        res.json(products);

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// ONLY PUMA
app.get("/products/puma", async (req, res) => {

    try {

        const result = await pool.query(
            `
            SELECT *
            FROM products
            WHERE vendor = 'PUMA'
            `
        );

        const products = result.rows.map(product => {

            const usd = Number(product.price || 0);

            const cop = ((usd * 1.5) + 20) * TRM;

            return {

                ...product,

                price_cop: Math.round(cop)
            };
        });

        res.json(products);

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// START SERVER

// app.listen(3001, "0.0.0.0", () => {

//     console.log("API running");
// });

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log("API running");
});