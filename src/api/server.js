require('dotenv').config();
const express = require('express');
const biensRouter = require('./routes/biens');
const updateBiensRouter = require('./routes/updateBiens');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/hello', (req, res) => {
    res.status(200).json({ message: 'hello world' });
});

app.use('/api/biens', biensRouter);
app.use('/api/biens', updateBiensRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Serveur demarre avec succes sur http://localhost:${PORT}`);
});
