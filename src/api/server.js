require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/hello', (req, res) => {
    res.status(200).json({ message: 'hello world' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Serveur demarre avec succes sur http://localhost:${PORT}`);
});
