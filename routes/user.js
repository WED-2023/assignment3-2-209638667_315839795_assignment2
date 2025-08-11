var express = require("express");
var router = express.Router();
const DButils = require("./utils/DButils");
const { query } = require("./utils/MySql");
const user_utils = require("./utils/user_utils");
const recipe_utils = require("./utils/recipes_utils");

/**
 * Authenticate all incoming requests by middleware
 */
router.use(async function (req, res, next) {
  if (req.session && req.session.user_id) {
    DButils.execQuery("SELECT user_id FROM users")
      .then((users) => {
        if (users.find((x) => x.user_id === req.session.user_id)) {
          req.user_id = req.session.user_id;
          next();
        }
      })
      .catch((err) => next(err));
  } else {
    res.sendStatus(401);
  }
});
/***************************************************************** Profile Start *****************************************************************/
/**
 * This path returns the logged-in user's profile details
 */
router.get("/profile", async (req, res, next) => {
  try {
    const user_id = req.user_id;
    const result = await DButils.execQuery(`
      SELECT username, firstname, lastname, email, country, profilePic
      FROM users
      WHERE user_id = ${user_id}
    `);

    if (result.length === 0) {
      return res.status(404).send({ message: "User not found" });
    }

    res.status(200).send(result[0]);
  } catch (error) {
    next(error);
  }
});

/***************************************************************** Profile End *****************************************************************/

/***************************************************************** Favorites Start *****************************************************************/

/**
 * This path gets body with recipeId and save this recipe in the favorites list of the logged-in user
 */
/**
 * Add recipe to favorites
 */
router.post('/favorites', async (req, res, next) => {
  try {
    // Check if user is logged in
    if (!req.session?.user_id) {
      return res.status(401).send({ message: "Authentication required" });
    }

    const user_id = req.session.user_id;
    const { recipeId } = req.body;

    if (!recipeId) {
      return res.status(400).send({ message: "Recipe ID is required" });
    }

    // Check if already in favorites
    const existing = await DButils.execQuery(
      `SELECT * FROM user_favorites WHERE user_id = ${user_id} AND recipe_id = ${recipeId}`
    );

    if (existing.length > 0) {
      // Already in favorites - return success but with a 409 status
      return res.status(409).send({
        message: "Recipe already in favorites",
        success: true,
        alreadyExists: true
      });
    }

    // Add to favorites - specify column names to avoid issues
    await DButils.execQuery(
      `INSERT INTO user_favorites (user_id, recipe_id) VALUES (${user_id}, ${recipeId})`
    );

    res.status(201).send({
      message: "Recipe added to favorites",
      success: true
    });
  } catch (error) {
    console.error("Error adding to favorites:", error);
    next(error);
  }
});

/**
 * Remove recipe from favorites
 */
router.delete('/favorites/:recipeId', async (req, res, next) => {
  try {
    // Check if user is logged in
    if (!req.session?.user_id) {
      return res.status(401).send({ message: "Authentication required" });
    }

    const user_id = req.session.user_id;
    const { recipeId } = req.params;

    await DButils.execQuery(
      `DELETE FROM user_favorites WHERE user_id = ${user_id} AND recipe_id = ${recipeId}`
    );

    res.status(200).send({
      message: "Recipe removed from favorites",
      success: true
    });
  } catch (error) {
    console.error("Error removing from favorites:", error);
    next(error);
  }
});

/**
 * This path returns the favorites recipes that were saved by the logged-in user
 */
router.get("/favorites", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;

    // Get favorite recipe IDs from database
    const recipes_id = await user_utils.getFavoriteRecipes(user_id);

    // If no favorites, return empty array
    if (!recipes_id || recipes_id.length === 0) {
      return res.status(200).send([]);
    }

    // Extract recipe IDs into array
    let recipes_id_array = [];
    recipes_id.map((element) => recipes_id_array.push(element.recipe_id));

    // Get recipe previews - this now handles errors gracefully and returns only successful recipes
    const results = await recipe_utils.getRecipesPreview(recipes_id_array);

    // Always return 200 with whatever recipes were successfully loaded
    // Even if it's an empty array due to API failures
    res.status(200).send(results);

  } catch (error) {
    console.error('Error in /favorites route:', error);
    // Only send error if it's a database error, not API error
    if (error.code && error.code.startsWith('ER_')) {
      // Database error
      next(error);
    } else {
      // For any other error, return empty array
      res.status(200).send([]);
    }
  }
});

/***************************************************************** Favorites End *****************************************************************/

/***************************************************************** My Recepies Start *****************************************************************/

/**
 * This path returns all recipes created by the logged-in user with preview details
 */
router.get("/my-recipes", async (req, res, next) => {
  try {
    const user_id = req.user_id;

    // Step 1: Fetch user's own recipes
    const recipes = await DButils.execQuery(`
      SELECT recipe_id AS id, title, image, cook_time AS cookTime, likes,
             is_vegan AS isVegan, is_vegetarian AS isVegetarian, is_gluten_free AS isGlutenFree
      FROM recipes
      WHERE user_id = ${user_id}
    `);

    if (recipes.length === 0) {
      return res.status(200).send([]);
    }

    // Step 2: Get watched and favorite recipe IDs
    const watchedRows = await DButils.execQuery(`
      SELECT recipe_id FROM watched_recipes WHERE user_id = ${user_id}
    `);
    const favoriteRows = await DButils.execQuery(`
      SELECT recipe_id FROM user_favorites WHERE user_id = '${user_id}'
    `);

    const watchedIds = watchedRows.map((r) => r.recipe_id);
    const favoriteIds = favoriteRows.map((r) => r.recipe_id);

    // Step 3: Add isWatched and isFavorite flags
    const enrichedRecipes = recipes.map((recipe) => ({
      ...recipe,
      isWatched: watchedIds.includes(recipe.id),
      isFavorite: favoriteIds.includes(recipe.id),
    }));

    res.status(200).send(enrichedRecipes);
  } catch (err) {
    next(err);
  }
});

/***************************************************************** My Recepies End *****************************************************************/

/***************************************************************** Family Recepies Start *****************************************************************/
/**
 * This path returns family recipes created by the logged-in user
 */
router.get("/family-recipes", async (req, res, next) => {
  try {
    // Fetch ALL family recipes, no user filtering
    const results = await DButils.execQuery(`
      SELECT id AS recipeId, title, image, cook_time AS cookTime,
             is_vegan AS isVegan, is_vegetarian AS isVegetarian, is_gluten_free AS isGlutenFree,
             ingredients, instructions, servings,
             who_made_it AS whoMadeIt,
             when_made AS whenMade
      FROM family_recipes
    `);

    res.status(200).send(results);
  } catch (err) {
    next(err);
  }
});

/**
 * This path allows the user to create a new family recipe
 */
router.post("/family-recipes", async (req, res, next) => {
  try {
    const user_id = req.user_id;

    const {
      title,
      image,
      cookTime,
      isVegan,
      isVegetarian,
      isGlutenFree,
      ingredients,
      instructions,
      servings,
      whoMadeIt,
      whenMade,
    } = req.body;

    if (!title || !ingredients || !instructions || !whoMadeIt || !whenMade) {
      return res.status(400).send({ message: "Missing required fields" });
    }

    const queryStr = `
      INSERT INTO family_recipes
        (user_id, title, image, cook_time, is_vegan, is_vegetarian, is_gluten_free,
        ingredients, instructions, servings, who_made_it, when_made)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await query(queryStr, [
      user_id,
      title,
      image,
      cookTime,
      isVegan,
      isVegetarian,
      isGlutenFree,
      Array.isArray(ingredients) ? ingredients.join(", ") : ingredients,
      instructions,
      servings,
      whoMadeIt,
      whenMade,
    ]);

    res.status(201).send({ message: "Family recipe created" });
  } catch (err) {
    next(err);
  }
});

/***************************************************************** Family Recepies End *****************************************************************/

/***************************************************************** Last-Search Start *****************************************************************/

router.get("/last-search", async (req, res, next) => {
  try {
    if (!req.session.lastSearch || req.session.lastSearch.length === 0) {
      return res
        .status(404)
        .send({ message: "No last search found", success: false });
    }

    const previews = await recipe_utils.getRecipesPreview(
      req.session.lastSearch
    );
    res.status(200).send(previews);
  } catch (err) {
    next(err);
  }
});

/***************************************************************** Last-Search End *****************************************************************/

/***************************************************************** Last-Viewed-Recipes Start *****************************************************************/
router.get("/last-viewed-recipes", async (req, res, next) => {
  try {
    if (!req.session || !req.session.user_id) {
      return res.status(401).send({ message: "Unauthorized" });
    }

    const user_id = req.session.user_id;
    const rows = await DButils.execQuery(`
      SELECT recipe_id FROM watched_recipes
      WHERE user_id = ${user_id}
      ORDER BY viewed_at DESC
      LIMIT 3
    `);

    const recipeIds = rows.map((r) => r.recipe_id);
    const previews = await recipe_utils.getRecipesPreview(recipeIds);

    res.status(200).send(previews);
  } catch (err) {
    next(err);
  }
});

/*************************************************************** Last-Viewed-Recipes End *****************************************************************/

module.exports = router;
