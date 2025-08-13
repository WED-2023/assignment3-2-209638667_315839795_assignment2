var express = require("express");
var router = express.Router();
const recipes_utils = require("./utils/recipes_utils");
const { query } = require("./utils/MySql");
const DButils = require("./utils/DButils");
const axios = require("axios");
const MySql = require("./utils/MySql");

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

// Get 3 random recipes
router.get("/random", async (req, res, next) => {
  try {
    const number = req.query.number || 3;

    // Get random recipes from Spoonacular
    const response = await axios.get(`${api_domain}/random`, {
      params: {
        apiKey,
        number: number,
        includeNutrition: false,
      },
    });

    // Format the response to match preview format
    const recipes = response.data.recipes.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      image: recipe.image,
      readyInMinutes: recipe.readyInMinutes,
      aggregateLikes: recipe.aggregateLikes,
      vegan: recipe.vegan,
      vegetarian: recipe.vegetarian,
      glutenFree: recipe.glutenFree,
    }));

    res.status(200).send({ recipes: recipes });
  } catch (error) {
    console.error("Random recipes error:", error);
    next(error);
  }
});

router.get("/:recipeId", async (req, res, next) => {
  try {
    const { recipeId } = req.params;

    // Log as watched if user is logged in
    if (req.session?.user_id) {
      await MySql.query(
        `
          INSERT INTO watched_recipes (user_id, recipe_id, viewed_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE viewed_at = CURRENT_TIMESTAMP
        `,
        [req.session.user_id, recipeId]
      );
    }

    // Check if user has favorited this recipe
    let isFavorite = false;
    let isWatched = true; // It's being watched now
    if (req.session?.user_id) {
      const favCheck = await DButils.execQuery(
        `SELECT * FROM user_favorites WHERE user_id = ${req.session.user_id} AND recipe_id = ${recipeId}`
      );
      isFavorite = favCheck.length > 0;
    }

    // Try fetching from local DB first (for user-created recipes)
    const local = await DButils.execQuery(`
      SELECT * FROM recipes WHERE recipe_id = ${recipeId}
    `);

    if (local.length > 0) {
      const recipe = local[0];

      const ingredients = await DButils.execQuery(`
        SELECT description FROM ingredients WHERE recipe_id = ${recipeId}
      `);

      // Format the recipe to match Spoonacular's format
      const formattedRecipe = {
        id: recipe.recipe_id,
        title: recipe.title,
        image: recipe.image,
        readyInMinutes: recipe.cook_time || 30,
        aggregateLikes: recipe.likes || 0,
        vegan: recipe.is_vegan === 1,
        vegetarian: recipe.is_vegetarian === 1,
        glutenFree: recipe.is_gluten_free === 1,
        extendedIngredients: ingredients.map((i) => ({
          original: i.description,
          id: Math.random(), // Add ID for Vue's :key requirement
        })),
        instructions: recipe.instructions,
        // Format instructions for the frontend
        analyzedInstructions: [
          {
            name: "",
            steps: recipe.instructions
              .split("\n")
              .filter((step) => step.trim())
              .map((step, index) => ({
                number: index + 1,
                step: step.trim(),
              })),
          },
        ],
        servings: recipe.servings || 1,
        isFavorite,
        isWatched,
        isUserRecipe: true,
      };

      // IMPORTANT: Wrap in 'recipe' object as frontend expects
      return res.send({ recipe: formattedRecipe });
    }

    // Fallback: use Spoonacular for external recipes
    const response = await axios.get(`${api_domain}/${recipeId}/information`, {
      params: {
        apiKey,
        includeNutrition: false,
      },
    });

    // Make sure analyzedInstructions exists (some recipes don't have it)
    if (
      !response.data.analyzedInstructions ||
      response.data.analyzedInstructions.length === 0
    ) {
      // Create basic instructions from the instructions field
      if (response.data.instructions) {
        response.data.analyzedInstructions = [
          {
            name: "",
            steps: response.data.instructions
              .split(".")
              .filter((step) => step.trim())
              .map((step, index) => ({
                number: index + 1,
                step: step.trim() + ".",
              })),
          },
        ];
      } else {
        // No instructions at all
        response.data.analyzedInstructions = [
          {
            name: "",
            steps: [
              { number: 1, step: "No instructions available for this recipe." },
            ],
          },
        ];
      }
    }

    // Add user-specific data and WRAP IN 'recipe' OBJECT
    const recipeData = {
      recipe: {
        ...response.data,
        isFavorite,
        isWatched,
        isUserRecipe: false,
      },
    };

    res.send(recipeData);
  } catch (error) {
    console.error("Get recipe error:", error);
    // Send more detailed error for debugging
    if (error.response) {
      // Spoonacular API error
      console.error("Spoonacular API error:", error.response.data);
      res.status(error.response.status).send({
        message: "Failed to fetch recipe from external API",
        error: error.response.data,
      });
    } else if (error.code === "ER_BAD_FIELD_ERROR") {
      // Database error
      res.status(500).send({
        message: "Database error",
        error: error.message,
      });
    } else {
      // Other errors
      res.status(500).send({
        message: "Failed to fetch recipe",
        error: error.message,
      });
    }
  }
});

router.put("/:recipeId/like", async (req, res, next) => {
  try {
    const { recipeId } = req.params;
    const { likes } = req.body;

    // Check if user is logged in
    if (!req.session?.user_id) {
      return res.status(401).send({ message: "Authentication required" });
    }

    // Only update if it's a local recipe (check if exists in DB)
    const localRecipe = await DButils.execQuery(
      `SELECT * FROM recipes WHERE recipe_id = ${recipeId}`
    );

    if (localRecipe.length === 0) {
      // Not a local recipe, can't update likes for Spoonacular recipes
      return res.status(400).send({
        message: "Cannot update likes for external recipes",
      });
    }

    // Update the likes count
    await DButils.execQuery(
      `UPDATE recipes SET likes = ${likes} WHERE recipe_id = ${recipeId}`
    );

    res.status(200).send({
      message: "Likes updated successfully",
      likes: likes,
      success: true,
    });
  } catch (error) {
    console.error("Error updating likes:", error);
    next(error);
  }
});

module.exports = router;
