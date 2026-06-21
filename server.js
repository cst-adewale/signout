const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const dns = require('dns');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Force Node.js to use Google DNS — fixes MongoDB Atlas SRV resolution on Windows
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (dnsErr) {
    console.warn('⚠️ Failed to set DNS servers to Google DNS, falling back to system defaults:', dnsErr.message);
}

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'sos_secret_key_2026_class';

// Enable GZIP compression to load images/JS/CSS assets faster
app.use(compression());

// Enable CORS and parsing of larger JSON payloads for Base64 receipt images
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// ─── Database Schema ──────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    whatsapp: { type: String, required: true },
    location: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

const OrderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    shirtType: { type: String, required: true },
    design: {
        id: { type: String, required: true },
        name: { type: String, required: true }
    },
    size: { type: String, required: true },
    qty: { type: Number, required: true },
    customization: {
        name: { type: String, default: '' },
        number: { type: String, default: '' }
    },
    payment: {
        method: { type: String, required: true }
    },
    receipt: {
        name: { type: String },
        size: { type: Number },
        type: { type: String },
        dataUrl: { type: String }
    },
    pricing: {
        unit: Number,
        subtotal: Number,
        discount: Number,
        total: Number
    },
    customer: {
        name: { type: String, required: true },
        email: { type: String, required: true },
        whatsapp: { type: String, required: true },
        location: { type: String, required: true }
    },
    status: { type: String, default: 'pending', enum: ['pending', 'confirmed', 'rejected', 'delivery', 'delivered'] }
});

const Order = mongoose.model('Order', OrderSchema);

// ─── Email Transporter Setup ──────────────────────────────────────────────────
let transporter;
function getTransporter() {
    if (transporter) return transporter;

    // Check if configuration exists
    if (!process.env.SMTP_USER || process.env.SMTP_PASS === 'your_gmail_app_password') {
        console.warn('⚠️ Nodemailer SMTP credentials not configured in .env. Emails will be logged to console.');
        return null;
    }

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    return transporter;
}

// Helper: Format price
const fmt = (n) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

// Helper: Send email wrapper
async function sendMailSafe(mailOptions) {
    const client = getTransporter();
    if (!client) {
        console.log(`📧 [Mock Email Service] Sending email:\nTo: ${mailOptions.to}\nSubject: ${mailOptions.subject}\nBody preview: ${mailOptions.text.slice(0, 250)}...`);
        return true;
    }
    try {
        await client.sendMail(mailOptions);
        console.log(`📧 Email successfully sent to ${mailOptions.to}`);
        return true;
    } catch (err) {
        console.error(`❌ Failed to send email to ${mailOptions.to}:`, err.message);
        return false;
    }
}

// ─── MongoDB Connection (Improved) ────────────────────────────────────────────
mongoose.connection.on('error', err => {
    console.error('❌ MongoDB Connection Event Error:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('connected', () => {
    console.log('✓ MongoDB connected and ready');
});

// Check if MONGODB_URI is configured
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in .env file');
    console.error('📝 Add this to your .env:');
    console.error('MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 1,
    retryWrites: true,
    w: 'majority',
    family: 4  // Force IPv4 (helps on Windows / Atlas)
})
    .then(() => {
        console.log('🚀 MongoDB Atlas Connected Successfully');

        // Add indexes for faster queries (with error handling)
        Promise.all([
            Order.collection.createIndex({ status: 1 }).catch(err => console.warn('⚠️ Index warning:', err.message)),
            Order.collection.createIndex({ 'customer.email': 1 }).catch(err => console.warn('⚠️ Index warning:', err.message)),
            Order.collection.createIndex({ createdAt: -1 }).catch(err => console.warn('⚠️ Index warning:', err.message)),
            User.collection.createIndex({ email: 1 }, { unique: true }).catch(err => console.warn('⚠️ Index warning:', err.message))
        ]).catch(err => console.warn('⚠️ Some indexes failed to create:', err.message));
    })
    .catch(err => {
        // Log the error but do NOT exit — Mongoose will keep retrying automatically
        console.error('\n⚠️  Initial MongoDB connection failed (server will keep retrying):');
        console.error('   ', err.message);
        console.error('   → Check your IP is whitelisted at cloud.mongodb.com → Network Access');
        console.error('   → Ensure port 27017 is not blocked by your network/firewall\n');
    });

// ─── Authentication Middleware ────────────────────────────────────────────────
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// ─── API Endpoints ────────────────────────────────────────────────────────────

// ─── User Authentication Endpoints ───

// 1. User Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password, whatsapp, location } = req.body;

        if (!name || !email || !password || !whatsapp || !location) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            whatsapp,
            location
        });

        await newUser.save();

        const token = jwt.sign({ id: newUser._id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                whatsapp: newUser.whatsapp,
                location: newUser.location
            }
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ success: false, message: 'Server error. Registration failed.' });
    }
});

// 2. User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            success: true,
            message: 'Logged in successfully',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                whatsapp: user.whatsapp,
                location: user.location
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error. Login failed.' });
    }
});

// 3. Get Logged-in User Profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, user });
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ─── Orders Endpoints ───

// 4. Retrieve Logged-in User's Orders
app.get('/api/orders/my', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (err) {
        console.error('Error fetching user orders:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 5. Submit New Order (Secured)
app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const orderData = req.body;
        const newOrder = new Order({
            ...orderData,
            userId: req.user.id
        });
        await newOrder.save();

        res.status(201).json({ success: true, message: 'Order submitted successfully', order: newOrder });

        // Trigger Admin Email notification asynchronously
        const adminEmail = 'pappymedia01@gmail.com';
        const mailOptions = {
            from: `"Signoutshirts System" <${process.env.SMTP_USER || 'system@signoutshirts.com'}>`,
            to: adminEmail,
            subject: `🚨 New Signout Shirt Order Placed: #${newOrder.id}`,
            text: `Hello Admin,\n\nA new order has been placed!\n\nOrder Details:\n` +
                `- Order ID: #${newOrder.id}\n` +
                `- Customer: ${newOrder.customer.name} (${newOrder.customer.whatsapp})\n` +
                `- Design: ${newOrder.design.name} (${newOrder.design.id})\n` +
                `- Details: Size ${newOrder.size}, Qty ${newOrder.qty}, Type: ${newOrder.shirtType}\n` +
                `- Payment Method: ${newOrder.payment.method === 'bank-transfer' ? 'Bank Transfer' : 'USSD'}\n` +
                `- Total Amount: ${fmt(newOrder.pricing.total)}\n\n` +
                `Please log in to the admin panel to review the uploaded receipt and confirm the order.`,
            html: `
                <h2>New Signout Shirt Order</h2>
                <p><strong>Order ID:</strong> #${newOrder.id}</p>
                <p><strong>Customer:</strong> ${newOrder.customer.name} (<a href="https://wa.me/${newOrder.customer.whatsapp.replace(/\D/g, '')}">WhatsApp Link</a>)</p>
                <p><strong>Email:</strong> ${newOrder.customer.email}</p>
                <p><strong>Delivery Location:</strong> ${newOrder.customer.location}</p>
                <hr/>
                <h3>Order Info</h3>
                <p><strong>Design:</strong> ${newOrder.design.name} (${newOrder.design.id})</p>
                <p><strong>Shirt Type:</strong> ${newOrder.shirtType === 'custom' ? 'Customized' : 'Plain'}</p>
                ${newOrder.shirtType === 'custom' ? `<p><strong>Back Personalization:</strong> Name: ${newOrder.customization.name}, Number: ${newOrder.customization.number}</p>` : ''}
                <p><strong>Size:</strong> ${newOrder.size}</p>
                <p><strong>Quantity:</strong> ${newOrder.qty}</p>
                <p><strong>Total Paid:</strong> ${fmt(newOrder.pricing.total)} (${newOrder.payment.method === 'bank-transfer' ? 'Bank Transfer' : 'USSD'})</p>
                <hr/>
                <p>Verify proof of payment receipt on the admin dashboard dashboard.</p>
            `
        };

        // If receipt is image, we can attach it to the email
        if (newOrder.receipt && newOrder.receipt.dataUrl && newOrder.receipt.dataUrl.startsWith('data:')) {
            const matches = newOrder.receipt.dataUrl.match(/^data:(.+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                mailOptions.attachments = [{
                    filename: newOrder.receipt.name || 'receipt.png',
                    content: Buffer.from(matches[2], 'base64'),
                    contentType: matches[1]
                }];
            }
        }

        sendMailSafe(mailOptions);

    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ success: false, message: 'Server error. Could not place order.' });
    }
});

// ─── Admin Endpoints ───

// 2. Admin Login Verification
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    const expected = process.env.ADMIN_PASSWORD || 'admin123';
    if (password === expected) {
        res.json({ success: true, message: 'Authenticated successfully' });
    } else {
        res.status(401).json({ success: false, message: 'Incorrect password' });
    }
});

// 3. Retrieve All Orders (Admin Dashboard)
app.get('/api/orders', async (req, res) => {
    try {
        const password = req.headers['x-admin-password'];
        const expected = process.env.ADMIN_PASSWORD || 'admin123';
        if (password !== expected) {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        const orders = await Order.find().select('-receipt.dataUrl').sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ success: false, message: 'Server error. Failed to fetch orders.' });
    }
});

// 3.5 Retrieve Order Receipt (Fetched on-demand for massive speedup)
app.get('/api/orders/:id/receipt', async (req, res) => {
    try {
        const password = req.headers['x-admin-password'];
        const expected = process.env.ADMIN_PASSWORD || 'admin123';
        if (password !== expected) {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        const order = await Order.findOne({ id: req.params.id }).select('receipt.dataUrl receipt.type');
        if (!order || !order.receipt) {
            return res.status(404).json({ success: false, message: 'Receipt not found' });
        }
        res.json({ success: true, dataUrl: order.receipt.dataUrl, type: order.receipt.type });
    } catch (err) {
        console.error('Error fetching receipt:', err);
        res.status(500).json({ success: false, message: 'Server error. Failed to load receipt.' });
    }
});

// 4. Confirm Order
app.post('/api/orders/:id/confirm', async (req, res) => {
    try {
        const password = req.headers['x-admin-password'];
        const expected = process.env.ADMIN_PASSWORD || 'admin123';
        if (password !== expected) {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        const order = await Order.findOne({ id: req.params.id });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        order.status = 'confirmed';
        await order.save();

        res.json({ success: true, message: 'Order confirmed successfully', order });

        // Send confirmation email to student
        const mailOptions = {
            from: `"Signoutshirts Store" <${process.env.SMTP_USER || 'system@signoutshirts.com'}>`,
            to: order.customer.email,
            subject: `🎉 Order Confirmed! — Signoutshirts #${order.id}`,
            text: `Hi ${order.customer.name},\n\nGood news! Your payment has been verified, and your order #${order.id} is officially CONFIRMED.\n\nDetails:\n` +
                `- Design: ${order.design.name}\n` +
                `- Size: ${order.size} (Qty: ${order.qty})\n` +
                `- Delivery: ${order.customer.location}\n\n` +
                `We will reach out to you on WhatsApp (${order.customer.whatsapp}) when your shirt is ready for delivery.\n\nThank you for choosing Signoutshirts!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px;">
                    <h2 style="color: #000; text-align: center;">Order Confirmed! 🎉</h2>
                    <p>Hi <strong>${order.customer.name}</strong>,</p>
                    <p>Good news! Your proof of payment has been reviewed and verified. Your sign-out shirt order <strong>#${order.id}</strong> has been officially confirmed.</p>
                    <div style="background-color: #f7fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h4 style="margin-top: 0;">Order Summary:</h4>
                        <p style="margin: 5px 0;"><strong>Design:</strong> ${order.design.name} (${order.design.id})</p>
                        <p style="margin: 5px 0;"><strong>Shirt Type:</strong> ${order.shirtType === 'custom' ? 'Customized' : 'Plain'}</p>
                        <p style="margin: 5px 0;"><strong>Size:</strong> ${order.size}</p>
                        <p style="margin: 5px 0;"><strong>Quantity:</strong> ${order.qty}</p>
                        <p style="margin: 5px 0;"><strong>Total Paid:</strong> ${fmt(order.pricing.total)}</p>
                    </div>
                    <p>We'll message you on your WhatsApp number (<strong>${order.customer.whatsapp}</strong>) as soon as production is completed and the shirt is ready for delivery.</p>
                    <p style="margin-top: 30px; font-size: 0.9em; color: #718096; text-align: center;">&copy; 2026 Signoutshirts. All rights reserved.</p>
                </div>
            `
        };

        sendMailSafe(mailOptions);

    } catch (err) {
        console.error('Error confirming order:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 5. Reject Order
app.post('/api/orders/:id/reject', async (req, res) => {
    try {
        const password = req.headers['x-admin-password'];
        const expected = process.env.ADMIN_PASSWORD || 'admin123';
        if (password !== expected) {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        const order = await Order.findOne({ id: req.params.id });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        order.status = 'rejected';
        await order.save();

        res.json({ success: true, message: 'Order marked as rejected', order });

        // Send rejection email to student to notify them about payment verification failure
        const mailOptions = {
            from: `"Signoutshirts Support" <${process.env.SMTP_USER || 'system@signoutshirts.com'}>`,
            to: order.customer.email,
            subject: `⚠️ Action Required: Order Update — Signoutshirts #${order.id}`,
            text: `Hi ${order.customer.name},\n\nWe could not confirm the payment receipt for your order #${order.id}.\n\nPlease contact support or place a new order with a valid payment proof.\n\nSupport Email: pappymedia01@gmail.com`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #fed7d7; padding: 20px; border-radius: 12px;">
                    <h2 style="color: #c53030; text-align: center;">Payment Receipt Rejected ⚠️</h2>
                    <p>Hi <strong>${order.customer.name}</strong>,</p>
                    <p>We ran into issues verifying the proof of payment receipt uploaded for your order <strong>#${order.id}</strong>.</p>
                    <p>As a result, your order status is marked as <strong>Rejected</strong>. Please double-check that you transferred the correct amount (${fmt(order.pricing.total)}) and uploaded the correct transaction receipt.</p>
                    <p>Please contact us directly at <a href="mailto:pappymedia01@gmail.com">pappymedia01@gmail.com</a> or message us on WhatsApp with details of your payment so we can resolve this manually.</p>
                    <p style="margin-top: 30px; font-size: 0.9em; color: #718096; text-align: center;">&copy; 2026 Signoutshirts. All rights reserved.</p>
                </div>
            `
        };

        sendMailSafe(mailOptions);

    } catch (err) {
        console.error('Error rejecting order:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 6. Mark Order as Sent for Delivery
app.post('/api/orders/:id/delivery', async (req, res) => {
    try {
        const password = req.headers['x-admin-password'];
        const expected = process.env.ADMIN_PASSWORD || 'admin123';
        if (password !== expected) {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        const order = await Order.findOne({ id: req.params.id });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        order.status = 'delivery';
        await order.save();

        res.json({ success: true, message: 'Order marked as sent for delivery', order });

        // Notify student their shirt is on the way
        const mailOptions = {
            from: `"Signoutshirts Store" <${process.env.SMTP_USER || 'system@signoutshirts.com'}>`,
            to: order.customer.email,
            subject: `🚚 Your Shirt is On the Way! — Signoutshirts #${order.id}`,
            text: `Hi ${order.customer.name},\n\nGreat news! Your sign-out shirt order #${order.id} has been sent for delivery to ${order.customer.location}.\n\nWe'll reach you on WhatsApp (${order.customer.whatsapp}) to coordinate the handoff.\n\nThank you for choosing Signoutshirts!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px;">
                    <h2 style="color: #000; text-align: center;">Your Shirt is On the Way! 🚚</h2>
                    <p>Hi <strong>${order.customer.name}</strong>,</p>
                    <p>Great news! Your sign-out shirt order <strong>#${order.id}</strong> has been packed and sent for delivery to <strong>${order.customer.location}</strong>.</p>
                    <p>We'll reach you on your WhatsApp (<strong>${order.customer.whatsapp}</strong>) to coordinate the final handoff.</p>
                    <p style="margin-top: 30px; font-size: 0.9em; color: #718096; text-align: center;">&copy; 2026 Signoutshirts. All rights reserved.</p>
                </div>
            `
        };
        sendMailSafe(mailOptions);

    } catch (err) {
        console.error('Error marking order for delivery:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 6.5 Mark Order as Delivered
app.post('/api/orders/:id/delivered', async (req, res) => {
    try {
        const password = req.headers['x-admin-password'];
        const expected = process.env.ADMIN_PASSWORD || 'admin123';
        if (password !== expected) {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        const order = await Order.findOne({ id: req.params.id });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        order.status = 'delivered';
        await order.save();

        res.json({ success: true, message: 'Order marked as delivered', order });

        // Notify student their shirt has been delivered
        const mailOptions = {
            from: `"Signoutshirts Store" <${process.env.SMTP_USER || 'system@signoutshirts.com'}>`,
            to: order.customer.email,
            subject: `🎉 Order Delivered! — Signoutshirts #${order.id}`,
            text: `Hi ${order.customer.name},\n\nYour sign-out shirt order #${order.id} has been successfully delivered!\n\nThank you for choosing Signoutshirts!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px;">
                    <h2 style="color: #059669; text-align: center;">Order Delivered! 🎉</h2>
                    <p>Hi <strong>${order.customer.name}</strong>,</p>
                    <p>Your sign-out shirt order <strong>#${order.id}</strong> has been successfully delivered to <strong>${order.customer.location}</strong>.</p>
                    <p>Thank you for ordering with Signoutshirts! We hope you love your new shirt.</p>
                    <p style="margin-top: 30px; font-size: 0.9em; color: #718096; text-align: center;">&copy; 2026 Signoutshirts. All rights reserved.</p>
                </div>
            `
        };
        sendMailSafe(mailOptions);

    } catch (err) {
        console.error('Error marking order as delivered:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 7. Analytics API
app.get('/api/analytics', async (req, res) => {
    try {
        const password = req.headers['x-admin-password'];
        const expected = process.env.ADMIN_PASSWORD || 'admin123';
        if (password !== expected) {
            return res.status(403).json({ success: false, message: 'Unauthorized access' });
        }

        const orders = await Order.find().select('-receipt.dataUrl');

        // Calculate counts
        let totalOrders = orders.length;
        let pending = 0;
        let confirmed = 0;
        let totalRevenue = 0;

        const designsMap = {};
        const sizesMap = {};
        const typesMap = { plain: 0, custom: 0 };
        const paymentsMap = { 'bank-transfer': 0, 'ussd': 0 };

        orders.forEach(order => {
            if (order.status === 'pending') pending++;
            if (['confirmed', 'delivery', 'delivered'].includes(order.status)) {
                confirmed++;
                totalRevenue += order.pricing.total;
            }

            // Design count
            const dName = order.design.name || order.design.id;
            designsMap[dName] = (designsMap[dName] || 0) + order.qty;

            // Size count
            sizesMap[order.size] = (sizesMap[order.size] || 0) + order.qty;

            // Shirt type count
            typesMap[order.shirtType] = (typesMap[order.shirtType] || 0) + order.qty;

            // Payment method count
            paymentsMap[order.payment.method] = (paymentsMap[order.payment.method] || 0) + order.qty;
        });

        res.json({
            success: true,
            summary: {
                totalOrders,
                pending,
                confirmed,
                revenue: totalRevenue
            },
            charts: {
                designs: Object.entries(designsMap).map(([label, count]) => ({ label, count })),
                sizes: Object.entries(sizesMap).map(([label, count]) => ({ label, count })),
                types: Object.entries(typesMap).map(([label, count]) => ({ label, count })),
                payments: Object.entries(paymentsMap).map(([label, count]) => ({ label, count }))
            }
        });

    } catch (err) {
        console.error('Error computing analytics:', err);
        res.status(500).json({ success: false, message: 'Server error. Failed to compute analytics.' });
    }
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('🔴 Unhandled Error:', {
        message: err.message,
        url: req.url,
        method: req.method,
        stack: err.stack
    });
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Wildcard route to serve index.html for undefined requests (so client side links resolve)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Visit: http://localhost:${PORT}`);
});
