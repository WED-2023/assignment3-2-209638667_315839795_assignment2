const DButils = require("./DButils");

async function markAsFavorite(user_id, recipe_id) {
    await DButils.execQuery(`insert into user_favorites values ('${user_id}',${recipe_id})`);
}

async function getFavoriteRecipes(user_id) {
    const recipes_id = await DButils.execQuery(`select recipe_id from user_favorites where user_id='${user_id}'`);
    return recipes_id;
}



exports.markAsFavorite = markAsFavorite;
exports.getFavoriteRecipes = getFavoriteRecipes;
