const http = require('http');
const fetch = require('node-fetch');
const Telegraf = require('telegraf');
const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const DynamoDBSession = require('telegraf-session-dynamodb');

const {
  DYNAMODB_TABLE,
  DYNAMODB_REGION,
  TELEGRAM_API_TOKEN,
  FOURSQUARE_CLIENT_ID,
  FOURSQUARE_CLIENT_SECRET
} = process.env;

const FOURSQUARE_API_URL = 'https://api.foursquare.com/v2/venues/search';

// https://developer.foursquare.com/docs/resources/categories
const beverages = {
  beer: {
    emoji: '🍺',
    categoryId: '56aa371ce4b08b9a8d57356c'
  },
  wisky: {
    emoji: '🥃',
    categoryId: '4bf58dd8d48988d122941735'
  },
  wine: {
    emoji: '🍷',
    categoryId: '4bf58dd8d48988d123941735'
  },
  cocktail: {
    emoji: '🍸',
    categoryId: '4bf58dd8d48988d11e941735'
  }
};

const fetchVenues = (categoryId, { latitude, longitude }) => {
  const params = {
    client_id: FOURSQUARE_CLIENT_ID,
    client_secret: FOURSQUARE_CLIENT_SECRET,
    intent: 'browse',
    limit: 10,
    categoryId,
    radius: 1000,
    v: '20180323',
    ll: `${latitude},${longitude}`
  };

  const queryParams = Object.keys(params)
    .map(key => `${key}=${params[key]}`)
    .join('&');

  const apiUrl = `${FOURSQUARE_API_URL}?${queryParams}`;

  return fetch(apiUrl)
    .then(response => response.json())
    .then(({ response }) => response.venues);
};

const bot = new Telegraf(TELEGRAM_API_TOKEN);

const dynamoDBSession = new DynamoDBSession({
  dynamoDBConfig: {
    params: {
      TableName: DYNAMODB_TABLE
    },
    region: DYNAMODB_REGION
  }
});

bot.use(dynamoDBSession.middleware());

const emojis = Object.values(beverages).map(({ emoji }) => emoji);

const EmojiKeyboard = Markup.keyboard([emojis])
  .resize()
  .extra();

bot.start(ctx =>
  ctx.reply('Hi sweetie! What woud you like to drink?', EmojiKeyboard));

Object.keys(beverages).forEach((beverage) => {
  const { emoji } = beverages[beverage];
  bot.hears(emoji, (ctx) => {
    ctx.session.beverage = beverage;

    ctx.reply(
      `So you want some ${emoji}, huh?`,
      Extra.markup(markup =>
        markup.keyboard([markup.locationRequestButton('Yes, please')]).resize())
    );
  });
});

bot.on('location', async (ctx) => {
  const { location } = ctx.message;
  const { emoji, categoryId } = beverages[ctx.session.beverage];
  ctx.session.beverage = null;

  const venues = await fetchVenues(categoryId, location);

  if (venues && venues.length > 0) {
    const venue = venues[0];

    await ctx.telegram.sendVenue(
      ctx.message.chat.id,
      venue.location.lat,
      venue.location.lng,
      `${emoji} ${venue.name}`,
      venue.location.address,
      { foursquare_id: venue.id, ...EmojiKeyboard }
    );
  } else {
    ctx.reply(
      `I'm sorry, sweetheart, but I couldn't find ${emoji} near you`,
      EmojiKeyboard
    );
  }
});

const PORT = process.env.PORT || 3000;
const botCallback = bot.webhookCallback('/');
http.createServer(botCallback).listen(PORT);
