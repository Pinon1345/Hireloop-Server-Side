const express = require('express');
const cors = require('cors');
const app = express()
const port = 5000
require('dotenv').config()

app.use(cors())
app.use(express.json())

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');



app.get('/', (req, res) => {
    res.send('Hello World!')
})




const uri = process.env.MONGO_DB_URI

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();


        // All Collections


        const database = client.db("hireloop_db");
        const userCollection = database.collection("user");
        const jobCollection = database.collection("jobs");
        const companyCollection = database.collection("companies");
        const applicationsCollection = database.collection("applications");
        const planCollection = database.collection("plans");
        const subscriptionCollection = database.collection("subscriptions");
        const sessionCollection = database.collection("session");


        // Verification Related

        // Using Middleware before API calling

        const verifyToken = async (req, res, next) => {

            const authHeader = req.headers?.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: "Unauthorized Access" })
            }

            const token = authHeader.split(' ')[1]

            if (!token) {
                return res.status(401).send({ message: "Unauthorized Access" })
            }

            const query = { token: token }
            const session = await sessionCollection.findOne(query)

            if (!session) {
                return res.status(401).send({ message: "Unauthorized Access" })
            }

            const userId = session.userId;

            const userQuery = {
                _id: userId
            }

            const user = await userCollection.findOne(userQuery)

            if (!user) {
                return res.status(401).send({ message: "Unauthorized Access" })
            }

            // set data in the request object
            req.user = user

            next()
        }

        // must be used after verifyToken middleware

        const verifySeeker = async (req, res, next) => {
            if (req.user?.role !== 'seeker') {
                return res.status(403).send({ message: "Forbidden Access" })
            }
            next()
        }

        // must be used after verifyToken middleware

        const verifyRecruiter = async (req, res, next) => {
            if (req.user?.role !== 'recruiter') {
                return res.status(403).send({ message: "Forbidden Access" })
            }
            next()
        }

        // must be used after verifyToken middleware

        const verifyAdmin = async (req, res, next) => {
            if (req.user?.role !== 'admin') {
                return res.status(403).send({ message: "Forbidden Access" })
            }
            next()
        }


        // API Start


        // User get related API


        app.get("/api/users", async (req, res) => {
            const email = req.query.email;

            const user = await userCollection.findOne({
                email: email,
            });

            res.send(user || {});
        });



        // Jobs related APIs

        // Post API for new job

        app.post('/api/jobs', async (req, res) => {
            const job = req.body
            const newJob = {
                ...job,
                createdAt: new Date()
            }
            const result = await jobCollection.insertOne(newJob)
            res.send(result);
        })

        // Individual Job Details 

        app.get('/api/jobs/:id', async (req, res) => {
            const id = req.params.id
            const query = {
                _id: new ObjectId(id)
            }
            const result = await jobCollection.findOne(query)
            res.send(result);
        })


        // Special Get API from create new job

        app.get('/api/jobs', async (req, res) => {
            try {
                console.log("server side q", req.query);
                const { search, category, type, remote, companyId, status, page = 1, limit = 10 } = req.query;

                const query = {};

                // 1. Search Filter
                if (search) {
                    query.$or = [
                        { jobTitle: { $regex: search, $options: 'i' } },
                        { companyName: { $regex: search, $options: 'i' } }
                    ];
                }

                // 2. Category Filter
                if (category && category !== 'All') {
                    query.jobCategory = { $regex: new RegExp(`^${category}$`, 'i') };
                }

                // 3. Type Filter
                if (type && type !== 'All') {
                    query.jobType = { $regex: new RegExp(`^${type}$`, 'i') };
                }

                // 4. Remote Filter
                if (remote && remote !== 'All') {
                    if (remote === 'Remote') {
                        query.isRemote = true;
                    } else if (remote === 'On-site') {
                        query.isRemote = false;
                    }
                }

                // 5. Company/Status Filters
                if (companyId) query.companyId = companyId;
                if (status) query.status = status;

                // Pagination setup
                const pageNum = Math.max(1, parseInt(page, 10) || 1);
                const limitNum = Math.max(1, parseInt(limit, 10) || 10);
                const skip = (pageNum - 1) * limitNum;

                const total = await jobCollection.countDocuments(query);
                const jobs = await jobCollection
                    .find(query)
                    .skip(skip)
                    .limit(limitNum)
                    .toArray();

                res.send({
                    jobs,
                    total,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(total / limitNum) || 1
                });
            } catch (error) {
                console.error("Error fetching jobs:", error);
                res.status(500).send({ error: "Failed to fetch jobs" });
            }
        });

        // Application related API

        // Get API for job application

        app.get('/api/applications', verifyToken, verifySeeker, async (req, res) => {
            const query = {}
            if (req.query.applicantId) {
                query.applicantId = req.query.applicantId;

                // Check whether asking for user information of someone else

                console.log(req.user, req.query.applicantId);

                if (req.user._id.toString() !== req.query.applicantId) {
                    return res.status(403).send({ message: "Forbidden Access" })
                }

            }
            if (req.query.jobId) {
                query.jobId = req.query.jobId;
            }
            const cursor = applicationsCollection.find(query)
            const result = await cursor.toArray()
            res.send(result);
        })


        // Post API for new job application

        app.post('/api/applications', async (req, res) => {
            const application = req.body
            const newApplication = {
                ...application,
                createdAt: new Date()
            }
            const result = await applicationsCollection.insertOne(newApplication)
            res.send(result);
        })


        // Company related API

        // app.get('/api/companies', async (req, res) => {
        //     const cursor = companyCollection.find().skip(18)
        //     const result = await cursor.toArray()
        //     res.send(result);
        // })


        // Inefficient way to join/aggregate collection

        app.get('/api/companies', verifyToken, async (req, res) => {
            const cursor = companyCollection.find().skip(18)
            const companies = await cursor.toArray()

            for (const company of companies) {
                const filter = {
                    companyId: company._id.toString()
                }
                const jobCount = await jobCollection.countDocuments(filter)
                company.jobCount = jobCount
            }

            res.send(companies);
        })


        // By using Aggregation Pipeline


        app.get('/api/companies2', async (req, res) => {
            const pipeline = [
                {
                    $skip: 10
                },
                {
                    $limit: 4
                }
            ]
            const cursor = companyCollection.aggregate(pipeline)
            const result = await cursor.toArray()
            res.send(result);
        })


        // Create Company

        app.post('/api/companies', async (req, res) => {
            try {

                // Remove _id from request body

                const { _id, ...companyData } = req.body;

                const newCompany = {
                    ...companyData,
                    updatedAt: new Date()
                };

                const result = await companyCollection.updateOne(
                    { recruiterId: newCompany.recruiterId },
                    { $set: newCompany },
                    { upsert: true }
                );

                res.send(result);

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: error.message });
            }
        });


        // Get API for Company

        app.get('/api/my/companies', async (req, res) => {
            const query = {};
            if (req.query.recruiterId) {
                query.recruiterId = req.query.recruiterId
            }
            const result = await companyCollection.findOne(query)
            res.send(result || {});
        })


        // Patch API for Update Company Status

        app.patch('/api/companies/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const updatedCompany = req.body
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    status: updatedCompany.status
                }
            }
            const result = await companyCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })


        // AIP for Plans

        // get API

        app.get('/api/plans', async (req, res) => {
            const query = {}
            if (req.query.plan_id) {
                query.id = req.query.plan_id
            }
            const plan = await planCollection.findOne(query)
            res.send(plan);
        })

        // API for Subscriptions

        // post API

        app.post('/api/subscriptions', async (req, res) => {
            const data = req.body
            const subscriptionInfo = {
                ...data,
                createdAt: new Date()
            }

            const result = await subscriptionCollection.insertOne(subscriptionInfo)

            // Update the user plan information

            const filter = { email: data.email };
            const updateDocument = {
                $set: {
                    plan: data.planId,
                },
            }

            const updateResult = await userCollection.updateOne(filter, updateDocument)
            res.send(updateResult);
        })




        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})