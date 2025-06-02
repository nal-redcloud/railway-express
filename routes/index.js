const express = require("express");
const pgp = require("pg-promise")();
const redis = require("redis");

const db = pgp(process.env.DATABASE_URL);

const router = express.Router();

const client = redis.createClient({
  url: process.env.REDIS_URL,
});

client.on("error", (err) => console.log("Redis Client Error", err));

// Initialize Redis connection
(async () => {
  await client.connect();
})();

/* GET home page. */
router.get("/", function (req, res, next) {
  db.one("SELECT NOW()")
    .then(function (data) {
      // Render the page only after receiving the data
      res.render("index", {
        title: "Hello World, Railway!",
        timeFromDB: data.now,
      });
    })
    .catch(function (error) {
      console.error("ERROR:", error);
      // If there’s an error, send a 500 response and do not call res.render
      res.status(500).send("Error querying the database");
    });
});

// Format output helper
function formatOutput(username, numOfRepos) {
  return `${username} has ${numOfRepos} public repositories`;
}

// Get repositories handler
async function getRepos(req, res) {
  try {
    const username = req.params["USER_NAME"];

    // Try to get data from Redis cache first
    const cachedData = await client.get(username);

    if (cachedData) {
      console.log(`Cache hit for ${username}`);
      // Parse the cached data if it's stored as a string
      const numOfRepos = parseInt(cachedData, 10);

      return res.render("repos", {
        title: "Cached GitHub Repositories",
        username: username,
        numOfRepos: numOfRepos,
        fromCache: true,
      });
    }

    console.log(`Cache miss for ${username}, fetching from GitHub API`);
    // If not in cache, fetch from GitHub API
    const response = await fetch(`https://api.github.com/users/${username}`);

    if (!response.ok) {
      throw new Error(`GitHub API responded with status: ${response.status}`);
    }

    const data = await response.json();
    const numOfRepos = data.public_repos;

    // Store in Redis cache with expiration of 1 hour (3600 seconds)
    await client.set(username, numOfRepos, {
      EX: 3600,
    });

    res.render("repos", {
      title: "GitHub Repositories",
      username: username,
      numOfRepos: numOfRepos,
      fromCache: false,
    });
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).send(`Error fetching repositories: ${err.message}`);
  }
}

// We're now handling caching directly in the getRepos function

// GitHub repositories route
router.get("/repos/:USER_NAME", getRepos);

module.exports = router;
