const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Enable CORS for Next.js frontend requests
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_DB_URI;

// Initialize MongoClient
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Cache database collections across serverless invocations
let db, userCollection, jobCollection, companyCollection, applicationsCollection, planCollection, subscriptionCollection, sessionCollection;

async function connectDB() {
    if (!db) {
        await client.connect();
        db = client.db("hireloop_db");
        userCollection = db.collection("user");
        jobCollection = db.collection("jobs");
        companyCollection = db.collection("companies");
        applicationsCollection = db.collection("applications");
        planCollection = db.collection("plans");
        subscriptionCollection = db.collection("subscriptions");
        sessionCollection = db.collection("session");
        console.log("Connected to MongoDB!");
    }
}

// Middleware to ensure DB connection per request
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error("MongoDB Connection Error:", err);
        res.status(500).json({ error: "Failed to connect to Database" });
    }
});

// Root Health Check
app.get('/', (req, res) => {
    res.send('Hireloop API Server Running!');
});

// Auth Verification Middleware
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader) return res.status(401).json({ message: "Unauthorized Access" });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Unauthorized Access" });

    const session = await sessionCollection.findOne({ token: token });
    if (!session) return res.status(401).json({ message: "Unauthorized Access" });

    const user = await userCollection.findOne({ _id: session.userId });
    if (!user) return res.status(401).json({ message: "Unauthorized Access" });

    req.user = user;
    next();
};

const verifySeeker = async (req, res, next) => {
    if (req.user?.userRole !== 'seeker')
        return res.status(403).json({ message: "Forbidden Access" });

    next();
};

const verifyAdmin = async (req, res, next) => {
    if (req.user?.userRole !== 'admin') return res.status(403).json({ message: "Forbidden Access" });
    next();
};

// Users APIs
app.get("/api/users", async (req, res) => {
    const email = req.query.email;
    const user = await userCollection.findOne({ email });
    res.send(user || {});
});

// Jobs APIs
app.post('/api/jobs', async (req, res) => {
    const job = req.body;
    const newJob = { ...job, createdAt: new Date() };
    const result = await jobCollection.insertOne(newJob);
    res.send(result);
});

app.get('/api/jobs/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const result = await jobCollection.findOne({ _id: new ObjectId(id) });
        res.send(result || {});
    } catch (err) {
        res.status(400).json({ error: "Invalid Job ID format" });
    }
});

app.get('/api/jobs', async (req, res) => {
    try {
        const { search, category, type, remote, companyId, status, page = 1, limit = 10 } = req.query;
        const query = {};

        // 1. Search Filter
        if (search && search.trim()) {
            query.$or = [
                { jobTitle: { $regex: search.trim(), $options: 'i' } },
                { companyName: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        // 2. Category Filter
        if (category && category !== 'All' && category !== 'Select an item') {
            query.jobCategory = { $regex: new RegExp(`^${category}$`, 'i') };
        }

        // 3. Type Filter
        if (type && type !== 'All' && type !== 'Select an item') {
            query.jobType = { $regex: new RegExp(`^${type}$`, 'i') };
        }

        // 4. Remote Filter
        if (remote && remote !== 'All' && remote !== 'Select an item') {
            if (remote === 'Remote') query.isRemote = true;
            if (remote === 'On-site') query.isRemote = false;
        }

        // 5. Company & Status Filters
        if (companyId) query.companyId = companyId;
        if (status) query.status = status;

        // Pagination setup
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 10);
        const skip = (pageNum - 1) * limitNum;

        const total = await jobCollection.countDocuments(query);
        const jobs = await jobCollection.find(query).skip(skip).limit(limitNum).toArray();

        res.json({
            jobs,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1
        });
    } catch (error) {
        console.error("Error fetching jobs:", error);
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
});

// Applications APIs
app.get('/api/applications', verifyToken, verifySeeker, async (req, res) => {
    const query = {};
    if (req.query.applicantId) {
        if (req.user._id.toString() !== req.query.applicantId) {
            return res.status(403).json({ message: "Forbidden Access" });
        }
        query.applicantId = req.query.applicantId;
    }
    if (req.query.jobId) query.jobId = req.query.jobId;

    const result = await applicationsCollection.find(query).toArray();
    res.send(result);
});

app.post('/api/applications', async (req, res) => {
    const application = req.body;
    const newApplication = { ...application, createdAt: new Date() };
    const result = await applicationsCollection.insertOne(newApplication);
    res.send(result);
});

// Companies APIs
app.get('/api/companies', verifyToken, async (req, res) => {
    const companies = await companyCollection.find().skip(18).toArray();
    for (const company of companies) {
        company.jobCount = await jobCollection.countDocuments({ companyId: company._id.toString() });
    }
    res.send(companies);
});

app.post('/api/companies', async (req, res) => {
    try {
        const { _id, ...companyData } = req.body;
        const newCompany = { ...companyData, updatedAt: new Date() };
        const result = await companyCollection.updateOne(
            { recruiterId: newCompany.recruiterId },
            { $set: newCompany },
            { upsert: true }
        );
        res.send(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/my/companies', async (req, res) => {
    const query = {};
    if (req.query.recruiterId) query.recruiterId = req.query.recruiterId;
    const result = await companyCollection.findOne(query);
    res.send(result || {});
});

app.patch('/api/companies/:id', verifyToken, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const updatedCompany = req.body;
    const result = await companyCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: updatedCompany.status } }
    );
    res.send(result);
});

// Plans & Subscriptions
app.get('/api/plans', async (req, res) => {
    const query = {};
    if (req.query.plan_id) query.id = req.query.plan_id;
    const plan = await planCollection.findOne(query);
    res.send(plan || {});
});

app.post('/api/subscriptions', async (req, res) => {
    const data = req.body;
    const subscriptionInfo = { ...data, createdAt: new Date() };
    await subscriptionCollection.insertOne(subscriptionInfo);

    const updateResult = await userCollection.updateOne(
        { email: data.email },
        { $set: { plan: data.planId } }
    );
    res.send(updateResult);
});

// Only listen locally in non-production environment
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server running locally on port ${port}`);
    });
}

module.exports = app;