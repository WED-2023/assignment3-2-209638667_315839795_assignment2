const axios = require("axios");
const tough = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

// Setup axios client with cookie support
const cookieJar = new tough.CookieJar();
const client = wrapper(
  axios.create({
    baseURL: "http://localhost:3000",
    jar: cookieJar,
    withCredentials: true,
  })
);

// Test user
const user = {
  username: "tomer123",
  firstname: "Tomer",
  lastname: "Rothman",
  country: "IL",
  email: "tomer@example.com",
  password: "pass123",
  profilePic: "pic.jpg",
};

const newRecipe = {
  title: "Tomer's Apple Pie",
  image: "https://example.com/images/pie.jpg",
  cookTime: "45 minutes",
  likes: 0,
  isVegan: false,
  isVegetarian: true,
  isGlutenFree: false,
  ingredients: ["2 apples", "1 cup sugar"],
  instructions: "Slice apples. Mix with sugar. Bake.",
  servings: 4,
};

const familyRecipe = {
  title: "Aunt Leah’s Cheesecake",
  image: "https://example.com/cheesecake.jpg",
  cookTime: "90 minutes",
  isVegan: false,
  isVegetarian: true,
  isGlutenFree: false,
  ingredients: ["cream cheese", "eggs", "sugar", "vanilla", "butter", "crust"],
  instructions: "Mix, bake, and chill.",
  servings: 6,
  whoMadeIt: "Aunt Leah",
  whenMade: "Shavuot",
};

(async () => {
  let createdRecipeId;

  try {
    // ✅ REGISTER
    try {
      const reg = await client.post("/Register", user);
      console.log("✅ Registration success:", reg.data);
    } catch (err) {
      if (err.response?.status === 409) {
        console.log("ℹ️ User already exists, skipping registration.");
      } else {
        throw err;
      }
    }

    // ✅ LOGIN
    await client.post("/Login", {
      username: user.username,
      password: user.password,
    });
    console.log("✅ Login success");

    // =====================
    // 🛠️ CREATE (SETTERS)
    // =====================

    // ✅ Create regular recipe
    try {
      const createRes = await client.post("/recipes", newRecipe);
      createdRecipeId = createRes.data.recipeId;
      console.log("✅ Created recipe:", createRes.data);
    } catch (err) {
      console.error(
        "❌ Failed to create recipe:",
        err.response?.data || err.message
      );
    }

    // ✅ Create family recipe
    try {
      const res = await client.post("/users/family-recipes", familyRecipe);
      console.log("✅ Family recipe created:", res.data);
    } catch (err) {
      console.error(
        "❌ Failed to create family recipe:",
        err.response?.data || err.message
      );
    }

    // ====================
    // 📥 FETCH (GETTERS)
    // ====================

    // ✅ Get profile
    try {
      const profile = await client.get("/users/profile");
      console.log("✅ User profile:", profile.data);
    } catch (err) {
      console.error(
        "❌ Failed to fetch user profile:",
        err.response?.data || err.message
      );
    }

    // ✅ Get recipe by ID
    if (createdRecipeId) {
      try {
        const getRes = await client.get(`/recipes/${createdRecipeId}`);
        console.log("✅ Retrieved recipe by ID:", getRes.data);
      } catch (err) {
        console.error(
          "❌ Failed to fetch recipe by ID:",
          err.response?.data || err.message
        );
      }
    }

    // ✅ Get /users/my-recipes
    try {
      const myRecipesRes = await client.get("/users/my-recipes");
      const found = myRecipesRes.data.find((r) => r.title === newRecipe.title);
      console.log("✅ My recipes fetched:", myRecipesRes.data);
      console.log(
        found
          ? "✅ Recipe appears in my recipes"
          : "⚠️ Recipe not found in my recipes"
      );
    } catch (err) {
      console.error(
        "❌ Failed to fetch /users/my-recipes:",
        err.response?.data || err.message
      );
    }

    // ✅ Get /users/family-recipes
    try {
      const familyRes = await client.get("/users/family-recipes");
      console.log("✅ Family recipes fetched:", familyRes.data);
    } catch (err) {
      console.error(
        "❌ Failed to fetch family recipes:",
        err.response?.data || err.message
      );
    }

    // ✅ Search for recipes
    try {
      const searchParams = {
        query: "pasta",
        diet: "vegetarian",
        limit: 3,
      };

      const searchRes = await client.get("/recipes/search/");
      const searchResults = searchRes.data;

      if (searchResults.length > 0) {
        console.log(
          "✅ Recipe search results:",
          searchResults.map((r) => r.title)
        );
      } else {
        console.warn("⚠️ Search returned no results");
      }

      // ✅ Now fetch /users/last-search
      const lastSearchRes = await client.get("/users/last-search");
      const lastSearchResults = lastSearchRes.data;

      console.log(
        "✅ Last search results from session:",
        lastSearchResults.map((r) => r.title)
      );

      const overlap = lastSearchResults.some((r) =>
        searchResults.some((sr) => sr.id === r.id)
      );

      if (overlap) {
        console.log("✅ /users/last-search matches latest /recipes/search ✅");
      } else {
        console.warn("⚠️ /users/last-search did not match the search results");
      }
    } catch (err) {
      console.error(
        "❌ Search or last-search failed:",
        err.response?.data || err.message
      );
    }

    // ✅ Get favorites (should be empty unless tested earlier)
    try {
      const favorites = await client.get("/users/favorites");
      console.log("✅ Favorites:", favorites.data);
    } catch (err) {
      console.error(
        "❌ Failed to fetch favorites:",
        err.response?.data || err.message
      );
    }

    // ✅ View some recipes to simulate "last viewed"
    try {
      const viewRes1 = await client.get("/recipes/1");
      const viewRes2 = await client.get("/recipes/2");
      const viewRes3 = await client.get("/recipes/3");

      console.log("✅ Viewed recipes to log last-viewed:", [
        viewRes1.data.id,
        viewRes2.data.id,
        viewRes3.data.id,
      ]);
    } catch (err) {
      console.error(
        "❌ Failed to simulate recipe views:",
        err.response?.data || err.message
      );
    }

    // ✅ Get last viewed recipes
    try {
      const lastViewed = await client.get("/users/last-viewed-recipes");
      console.log(
        "✅ Last viewed recipes:",
        lastViewed.data.map((r) => r.title)
      );

      if (lastViewed.data.length > 0) {
        console.log("✅ /users/last-viewed-recipes returned results");
      } else {
        console.warn("⚠️ No recipes returned from /users/last-viewed-recipes");
      }
    } catch (err) {
      console.error(
        "❌ Failed to fetch /users/last-viewed-recipes:",
        err.response?.data || err.message
      );
    }
  } catch (err) {
    console.error("❌ Test failed:", err.response?.data || err.message);
  }
})();
