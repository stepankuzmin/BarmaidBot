const http = require('http');
const fetch = require('node-fetch');
const Telegraf = require('telegraf');
const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const DynamoDB = require('aws-sdk/clients/dynamodb');

const {
  DYNAMODB_TABLE,
  DYNAMODB_REGION,
  TELEGRAM_API_TOKEN,
  FOURSQUARE_CLIENT_ID,
  FOURSQUARE_CLIENT_SECRET
} = process.env;

const db = new DynamoDB.DocumentClient({
  region: DYNAMODB_REGION,
  params: {
    TableName: DYNAMODB_TABLE
  }
});

const getSessionKey = ctx =>
  ctx.from && ctx.chat && `${ctx.from.id}:${ctx.chat.id}`;

const saveSession = (ctx, values = {}) => {
  const params = {
    Item: {
      HashKey: getSessionKey(ctx),
      ...values
    }
  };

  return db.put(params).promise();
};

const restoreSession = (ctx) => {
  const params = {
    Key: {
      HashKey: getSessionKey(ctx)
    }
  };

  return db
    .get(params)
    .promise()
    .then(({ Item }) => Item);
};

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

const emojis = Object.values(beverages).map(({ emoji }) => emoji);

const EmojiKeyboard = Markup.keyboard([emojis])
  .resize()
  .extra();

bot.start(ctx =>
  ctx.reply('Hi sweetie! What woud you like to drink?', EmojiKeyboard));

Object.keys(beverages).forEach((beverage) => {
  const { emoji } = beverages[beverage];
  bot.hears(emoji, async (ctx) => {
    await saveSession(ctx, { beverage });

    ctx.reply(
      `So you want some ${emoji}, huh?`,
      Extra.markup(markup =>
        markup.keyboard([markup.locationRequestButton('Yes, please')]).resize())
    );
  });
});

bot.on('location', async (ctx) => {
  const session = await restoreSession(ctx);
  const beverage = beverages[session.beverage];

  if (!beverage) {
    await ctx.reply(
      'I didn\'t catch what you said, sweetie. What woud you like to drink?',
      EmojiKeyboard
    );

    return;
  }

  const { location } = ctx.message;
  const { emoji, categoryId } = beverage;

  const venues = await fetchVenues(categoryId, location);

  if (!venues || venues.length === 0) {
    await ctx.reply(
      `I'm sorry, sweetheart, but I couldn't find ${emoji} near you`,
      EmojiKeyboard
    );

    return;
  }

  const venue = venues[0];

  await ctx.telegram.sendVenue(
    ctx.message.chat.id,
    venue.location.lat,
    venue.location.lng,
    `${emoji} ${venue.name}`,
    venue.location.address,
    { foursquare_id: venue.id, ...EmojiKeyboard }
  );
});

const PORT = process.env.PORT || 3000;
const botCallback = bot.webhookCallback('/');
http.createServer(botCallback).listen(PORT);
