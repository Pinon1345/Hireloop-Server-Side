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


        const database = client.db("hireloop_db");
        const userCollection = database.collection("user");
        const jobCollection = database.collection("jobs");
        const companyCollection = database.collection("companies");
        const applicationsCollection = database.collection("applications");
        const planCollection = database.collection("plans");
        const subscriptionCollection = database.collection("subscriptions");



        // API Start


        // User get related API

        app.get("/api/users", async (req, res) => {
            const email = req.query.email;

            const user = await userCollection.findOne({
                email: email,
            });

            res.send(user || {});
        });


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
            const query = {};
            if (req.query.companyId) {
                query.companyId = req.query.companyId;
            }
            if (req.query.status) {
                query.status = req.query.status;
            }

            const cursor = jobCollection.find(query)
            const result = await cursor.toArray()
            res.send(result);


        })

        // Application related API

        // Get API for job application

        app.get('/api/applications', async (req, res) => {
            const query = {}
            if (req.query.applicantId) {
                query.applicantId = req.query.applicantId;
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

        app.get('/api/companies', async (req, res) => {
            const cursor = companyCollection.find().skip(18)
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