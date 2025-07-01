var express = require("express");
var router = express.Router();
const recipes_utils = require("./utils/recipes_utils");
const { query } = require("./utils/MySql");
const DButils = require("./utils/DButils");
const axios = require("axios");

const api_domain = "https://api.spoonacular.com/recipes";
const apiKey = process.env.spooncular_apiKey;

router.get("/", (req, res) => res.send("im here"));

router.get("/search", async (req, res, next) => {
  try {
    const {
      query = "",
      cuisine,
      diet,
      intolerances,
      sort,
      limit = 5,
    } = req.query;

    const params = {
      apiKey,
      query,
      number: limit,
      addRecipeInformation: false,
    };

    if (cuisine) params.cuisine = cuisine;
    if (diet) params.diet = diet;
    if (intolerances) params.intolerances = intolerances;
    if (sort === "popularity") params.sort = "popularity";
    if (sort === "time") params.sort = "time";

    const spoonRes = await axios.get(`${api_domain}/complexSearch`, { params });
    const recipesList = spoonRes.data.results;

    // Store last search recipe IDs in session
    req.session.lastSearch = recipesList.map((r) => r.id);

    // Get preview details for each recipe
    const previews = await recipes_utils.getRecipesPreview(
      req.session.lastSearch
    );

    res.status(200).send(previews);
  } catch (err) {
    next(err);
  }
});

//
router.post("/", async (req, res, next) => {
  try {
    if (!req.user_id) {
      return res.status(401).send({ message: "Unauthorized" });
    }

    const {
      title,
      image,
      cookTime,
      likes = 0,
      isVegan,
      isVegetarian,
      isGlutenFree,
      ingredients,
      instructions,
      servings,
    } = req.body;

    // Basic validation (you can add more)
    if (!title || !instructions || !ingredients || ingredients.length === 0) {
      return res.status(400).send({ message: "Missing required fields" });
    }

    // Insert into recipes table
    const insertRecipeQuery = `
      INSERT INTO recipes
        (user_id, title, image, cook_time, likes,
         is_vegan, is_vegetarian, is_gluten_free, instructions, servings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const recipeResult = await query(insertRecipeQuery, [
      req.user_id,
      title,
      image,
      cookTime,
      likes,
      isVegan,
      isVegetarian,
      isGlutenFree,
      instructions,
      servings,
    ]);

    const recipeId = recipeResult.insertId;

    // Insert ingredients
    for (const ingredient of ingredients) {
      await query(
        "INSERT INTO ingredients (recipe_id, description) VALUES (?, ?)",
        [recipeId, ingredient]
      );
    }

    res.status(201).send({ message: "Recipe created", recipeId });
  } catch (err) {
    next(err);
  }
});

/**
 * This path allows the user to get a specific recipe by its ID
 * It first checks if the recipe exists in the local DB.
 * If not, it fetches the recipe from Spoonacular API.
 * If the user is logged in, it logs the recipe as watched.
 */


// Get a random recipe
router.get('/random', async (req, res, next) => {
  try {
    // This returns ONE random recipe (change LIMIT as needed)
    const randomRecipe = await DButils.execQuery(
      `SELECT * FROM recipes ORDER BY RAND() LIMIT 1`
    );
    res.status(200).send({ recipes: randomRecipe });
  } catch (error) {
    next(error);
  }
});

router.get("/:recipeId", async (req, res, next) => {
  try {
    const { recipeId } = req.params;

    // Log as watched if user is logged in
    if (req.session?.user_id) {
      await query(
        `
          INSERT INTO watched_recipes (user_id, recipe_id, viewed_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE viewed_at = CURRENT_TIMESTAMP
        `,
        [req.session.user_id, recipeId]
      );
    }

    // Try fetching from local DB first
    const local = await DButils.execQuery(`
      SELECT * FROM recipes WHERE recipe_id = ${recipeId}
    `);

    if (local.length > 0) {
      const recipe = local[0];

      const ingredients = await DButils.execQuery(`
        SELECT description FROM ingredients WHERE recipe_id = ${recipeId}
      `);

      return res.send({
        id: recipe.recipe_id,
        title: recipe.title,
        image: recipe.image,
        cookTime: recipe.cook_time,
        likes: recipe.likes,
        isVegan: recipe.is_vegan,
        isVegetarian: recipe.is_vegetarian,
        isGlutenFree: recipe.is_gluten_free,
        ingredients: ingredients.map((i) => i.description),
        instructions: recipe.instructions,
        servings: recipe.servings,
      });
    }

    // Fallback: use Spoonacular
    const spoonacular = await recipes_utils.getRecipeDetails(recipeId);
    res.send(spoonacular);
  } catch (error) {
    next(error);
  }
});





module.exports = router;
