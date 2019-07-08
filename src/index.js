const slack = require("@slack/web-api");
const elasticsearch = require("@elastic/elasticsearch");

const slackClient = new slack.WebClient(process.env.SLACK_API_TOKEN);
const elasticsearchClient = new elasticsearch.Client({
  node: process.env.ELASTICSEARCH_HOST
});

const partialUpdateInterval = 60; // seconds
const fullUpdateInterval = 25 * 60 * 60; // seconds

function now() {
  return new Date().valueOf() / 1000;
}

async function getChannels() {
  //const response = await slackClient.conversations.list({ limit: 1000 });
  //return response.channels;
  return [
    {
      id: "CEX80FTLY",
      name: "aap-troubleshooting"
    }
  ];
}

async function getHistory(channel, seconds = null) {
  const response = await slackClient.channels.history({
    channel: channel.id,
    oldest: seconds ? now() - seconds : undefined,
    count: 1000
  });
  if (response.has_more) {
    console.log(
      "History for channel",
      channel.name,
      "has more than 1,000 messages."
    );
    console.log("Some messages may not have been recorded.");
  }

  return response.messages;
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
      message.user = getById(users, message.user);
      message.iso_ts = new Date(message.ts * 1000).toISOString();
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
