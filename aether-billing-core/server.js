require('dotenv').config();
const express = require('express');
const paymentRoutes = require('./routes/payment');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    const allowedOrigin = process.env.AETHER_ALLOWED_ORIGIN || '*';
    res.header('Access-Control-Allow-Origin', allowedOrigin);
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    return next();
});

// Mount the payment orchestration layer
app.use('/api/v1', paymentRoutes);

app.get('/', (req, res) => {
    res.send('Aether Billing API is running.');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Aether Engine online on port ${PORT}`));
