const slack = require("@slack/web-api");
const elasticsearch = require("@elastic/elasticsearch");

const slackClient = new slack.WebClient(process.env.SLACK_API_TOKEN);
const elasticsearchClient = new elasticsearch.Client({
  node: process.env.ELASTICSEARCH_HOST
});

const partialUpdateInterval = 60 * 60; // 60 minutes
const fullUpdateInterval = 12 * 60 * 60; // 24 hours

function now() {
  return new Date().valueOf() / 1000;
}

async function getChannels() {
  const response = await slackClient.conversations.list({ limit: 1000 });
  return response.channels;
}

async function getHistory(channel, seconds = null, latest = null) {
  const response = await slackClient.channels.history({
    channel: channel.id,
    oldest: seconds ? now() - seconds : undefined,
    count: 1000,
    latest: latest
  });
  var messages = response.messages;
  if (response.has_more) {
    console.log(
      "History for channel",
      channel.name,
      "exceeded page limit, requesting next page..."
    );
    if (response.messages.length > 0) {
      messages = messages.concat(
        await getHistory(
          channel,
          seconds,
          response.messages[response.messages.length - 1].ts
        )
      );
    }
  }

  return messages;
}

async function getUsers() {
  const response = await slackClient.users.list();
  return response.members;
}

function getById(list, id) {
  for (var i = 0; i < list.length; i++) {
    var element = list[i];
    if (element.id === id) {
      return element;
    }
  }
  return null;
}

async function saveDocument(id, document) {
  try {
    await elasticsearchClient.create({
      index: "slack",
      type: "_doc",
      id: id,
      body: document
    });
  } catch (err) {
    await elasticsearchClient.update({
      index: "slack",
      type: "_doc",
      id: id,
      body: { doc: document }
    });
  }
}

async function saveHistory(seconds = null) {
  const channels = await getChannels();
  const users = await getUsers();

  for (var i = 0; i < channels.length; i++) {
    const channel = channels[i];
    console.log("Saving channel", channel.name);
    const history = await getHistory(channel, seconds);

    console.log("Found", history.length, "messages in history");
    for (var j = 0; j < history.length; j++) {
      const message = history[j];
      message.channel = channel;
      message.user = getById(users, message.user);
      message.iso_ts = message.ts
        ? new Date(message.ts * 1000).toISOString()
        : undefined;
      if (!message.ts) console.log(message);

      try {
        await saveDocument(message.ts, message);
      } catch (err) {
        console.log(err);
        console.log(JSON.stringify(err));
      }
    }
  }
}

saveHistory().then(function() {
  setTimeout(async function backup() {
    console.log("Performing backup of recent messages");
    await saveHistory(partialUpdateInterval * 2);
    setTimeout(backup, partialUpdateInterval * 1000);
  }, partialUpdateInterval * 1000);

  setTimeout(async function backup() {
    console.log("Performing backup of all messages in history");
    await saveHistory();
    setTimeout(backup, fullUpdateInterval * 1000);
  }, fullUpdateInterval * 1000);
});
// saveHistory();
