require('dotenv').config();

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const salesOrderRoutes = require('./routes/salesOrderRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
}));
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/customers', customerRoutes);
app.use('/enquiries', enquiryRoutes);
app.use('/quotations', quotationRoutes);
app.use('/sales-orders', salesOrderRoutes);
app.use('/inventory', inventoryRoutes);

app.get('/health', (req, res) => {
  res.json({ message: 'Supply ERP backend is running' });
});

module.exports = app;
