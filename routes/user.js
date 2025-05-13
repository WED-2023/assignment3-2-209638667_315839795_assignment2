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
router.post("/favorites", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipe_id = req.body.recipeId;
    await user_utils.markAsFavorite(user_id, recipe_id);
    res.status(200).send("The Recipe successfully saved as favorite");
  } catch (error) {
    next(error);
  }
});

/**
 * This path returns the favorites recipes that were saved by the logged-in user
 */
router.get("/favorites", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    let favorite_recipes = {};
    const recipes_id = await user_utils.getFavoriteRecipes(user_id);
    let recipes_id_array = [];
    recipes_id.map((element) => recipes_id_array.push(element.recipe_id)); //extracting the recipe ids into array
    const results = await recipe_utils.getRecipesPreview(recipes_id_array);
    res.status(200).send(results);
  } catch (error) {
    next(error);
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
      SELECT recipe_id FROM FavoriteRecipes WHERE user_id = '${user_id}'
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
    const user_id = req.user_id;

    const results = await DButils.execQuery(`
      SELECT id AS recipeId, title, image, cook_time AS cookTime,
             is_vegan AS isVegan, is_vegetarian AS isVegetarian, is_gluten_free AS isGlutenFree,
             ingredients, instructions, servings,
             who_made_it AS whoMadeIt,
             when_made AS whenMade
      FROM family_recipes
      WHERE user_id = ${user_id}
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
