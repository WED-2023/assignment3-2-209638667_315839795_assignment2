const axios = require("axios");
const DButils = require("./DButils");
const api_domain = "https://api.spoonacular.com/recipes";

/**
 * Get recipe information from Spoonacular API
 */
async function getRecipeInformation(recipe_id) {
  return await axios.get(`${api_domain}/${recipe_id}/information`, {
    params: {
      includeNutrition: false,
      apiKey: process.env.spooncular_apiKey,
    },
  });
}

/**
 * Get recipe details from local DB first, then fallback to Spoonacular
 */
async function getRecipeDetails(recipe_id) {
  try {
    // First, check if recipe exists in local database
    const localRecipes = await DButils.execQuery(
      `SELECT * FROM recipes WHERE recipe_id = ${recipe_id}`
    );

    if (localRecipes.length > 0) {
      // Recipe found in local database
      const recipe = localRecipes[0];

      return {
        id: recipe.recipe_id,
        title: recipe.title,
        readyInMinutes: recipe.cook_time || 30,
        image: recipe.image || 'https://via.placeholder.com/300x200?text=No+Image',
        popularity: recipe.likes || 0,
        vegan: recipe.is_vegan === 1,
        vegetarian: recipe.is_vegetarian === 1,
        glutenFree: recipe.is_gluten_free === 1,
        instructions: recipe.instructions
      };
    }

    // Recipe not in local DB, fetch from Spoonacular
    const recipe_info = await getRecipeInformation(recipe_id);
    const {
      id,
      title,
      readyInMinutes,
      image,
      aggregateLikes,
      vegan,
      vegetarian,
      glutenFree,
    } = recipe_info.data;

    return {
      id: id,
      title: title,
      readyInMinutes: readyInMinutes,
      image: image,
      popularity: aggregateLikes,
      vegan: vegan,
      vegetarian: vegetarian,
      glutenFree: glutenFree,
      instructions: recipe_info.data.instructions
    };
  } catch (error) {
    console.error(`Error fetching recipe ${recipe_id}:`, error.message);
    // Return null to indicate this recipe couldn't be loaded
    return null;
  }
}

/**
 * Get multiple recipes preview with local DB check first
 * Optimized to minimize API calls
 */
async function getRecipesPreview(recipe_ids) {
  if (!recipe_ids || recipe_ids.length === 0) {
    return [];
  }

  try {
    // Convert recipe_ids to ensure they're numbers
    const numericIds = recipe_ids.map(id => parseInt(id));

    // Step 1: Get all recipes from local DB in one query
    const localRecipes = await DButils.execQuery(
      `SELECT * FROM recipes WHERE recipe_id IN (${numericIds.join(',')})`
    );

    // Create a map of local recipes by ID
    const localRecipeMap = {};
    localRecipes.forEach(recipe => {
      localRecipeMap[recipe.recipe_id] = {
        id: recipe.recipe_id,
        title: recipe.title,
        readyInMinutes: recipe.cook_time || 30,
        image: recipe.image || 'https://via.placeholder.com/300x200?text=No+Image',
        popularity: recipe.likes || 0,
        vegan: recipe.is_vegan === 1,
        vegetarian: recipe.is_vegetarian === 1,
        glutenFree: recipe.is_gluten_free === 1,
        instructions: recipe.instructions
      };
    });

    // Step 2: Identify which recipes need to be fetched from Spoonacular
    const missingIds = numericIds.filter(id => !localRecipeMap[id]);

    // Step 3: Fetch missing recipes from Spoonacular (if any)
    const spoonacularRecipes = [];

    if (missingIds.length > 0) {
      // Fetch recipes one by one to handle individual failures
      const promises = missingIds.map(async (id) => {
        try {
          const recipe_info = await getRecipeInformation(id);
          const data = recipe_info.data;

          return {
            id: data.id,
            title: data.title,
            readyInMinutes: data.readyInMinutes,
            image: data.image,
            popularity: data.aggregateLikes,
            vegan: data.vegan,
            vegetarian: data.vegetarian,
            glutenFree: data.glutenFree,
            instructions: data.instructions
          };
        } catch (error) {
          console.error(`Failed to fetch recipe ${id} from Spoonacular:`, error.message);
          // Return null for failed recipes - they'll be filtered out
          return null;
        }
      });

      const results = await Promise.allSettled(promises);
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value !== null) {
          spoonacularRecipes.push(result.value);
        }
      });
    }

    // Step 4: Combine results - only include successfully loaded recipes
    const allRecipes = [];

    // Add all local recipes
    numericIds.forEach(id => {
      if (localRecipeMap[id]) {
        allRecipes.push(localRecipeMap[id]);
      } else {
        // Check if we got it from Spoonacular
        const spoonacularRecipe = spoonacularRecipes.find(r => r && r.id === id);
        if (spoonacularRecipe) {
          allRecipes.push(spoonacularRecipe);
        }
        // If not found anywhere, just skip it (no placeholder)
      }
    });

    return allRecipes;
  } catch (error) {
    console.error('Error in getRecipesPreview:', error);
    // On complete failure, return empty array
    return [];
  }
}

exports.getRecipeDetails = getRecipeDetails;
exports.getRecipesPreview = getRecipesPreview;
exports.getRecipeInformation = getRecipeInformation;