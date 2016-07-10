/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

A simple slash command for slack that reports the current revenue based
on mites time tracking and a simple revenue projection for the current year.

It is based on
- botkit: http://howdy.ai/botkit
- mite: http://mite.yo.lk

For more information consult the README.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

// DEPENDENCIES
var _ = require('underscore')._;
var miteAPI = require('mite-api');
var Botkit = require('botkit');


// HELPER FUNCTIONS

var printHelp = function(missingEnvVariable) {
  console.log("An error occurred. Environment Variable missing: " + missingEnvVariable)
  console.log("Usage: MITE_API_KEY=[MITE API KEY] CLIENT_ID=[SLACK CLIENT_ID] CLIENT_SECRET=[SLACK CLIENT SECRET] VERIFICATION_TOKEN=[SLACK VERIFICATION TOKEN] PORT=[PORT] npm start")
}

var goodJobArray = [
  "Great!",
  "You are so awesome",
  "Nice job!",
  "Keep up the great work!",
  "You rock!",
  "Can you spend all this money?",
  "http://giphy.com/gifs/homer-simpson-the-simpsons-season-6-DTywu7YYjWCVW",
]

var okButCanBeBetterArray = [
  "Not bad!",
  "Good! Not great, but good!",
  "http://giphy.com/gifs/not-bad-bill-and-ted-JyjWw4ZLdSPE4",
  "http://giphy.com/gifs/season-11-the-simpsons-11x3-l2JdXjyFmZj1Ijb6o",
  "http://giphy.com/gifs/DnAMdo0dZrlm"
]

var youShouldWorkMoreArray = [
  "What's going on? Are you ok?",
  "Next week will be better... probably",
  "Come on, let's go!",
  "I am sure, you can do better than that!",
  "Whatever, I'll do what I want...",
  "¯\_(ツ)_/¯"
]

// the projected revenue in thousands
var getFeedback = function(projectedRevenue) {
  var array;
  if (projectedRevenue > process.env.FEEDBACK_H) {
    array = goodJobArray;
  } else if (projectedRevenue >= process.env.FEEDBACK_L && projectedRevenue <= process.env.FEEDBACK_H) {
    array = okButCanBeBetterArray;
  } else if (projectedRevenue < process.env.FEEDBACK_L) {
    array = youShouldWorkMoreArray;
  }

  return array[Math.floor(Math.random() * array.length)];
}

var shouldDisplayFeedback = function() {
  return (process.env.FEEDBACK == "true" && process.env.FEEDBACK_H && process.env.FEEDBACK_L)
}

// MITE FUNCTIONS

var getDayInCurrentYear = function() {
  var now = new Date();
  var start = new Date(now.getFullYear(), 0, 0);
  var diff = now - start;
  var oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

var getDaysInCurrentYear = function() {
  var year = new Date().getFullYear();
  if(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
    // Leap year
    return 366;
  } else {
    // Not a leap year
    return 365;
  }
}

var getFinancialMetrics = function(resultCallback) {
  var year = new Date().getFullYear();
  mite.getTimeEntries({"year": year}, function(error, time_entry_wrappers) {
    var days_remaining_this_year = getDaysInCurrentYear() - getDayInCurrentYear();
    var fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    var oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    var entries = _.map(time_entry_wrappers, function(time_entry_wrapper) { return time_entry_wrapper.time_entry; });
    var entries_this_year = _.filter(entries, function(time_entry) { return time_entry.date_at.indexOf(year) == 0; });
    var entries_last_4_weeks = _.filter(entries_this_year, function(time_entry) {
      return new Date(time_entry.created_at) > fourWeeksAgo;
    });
    var entries_last_week = _.filter(entries_last_4_weeks, function(time_entry) {
      return new Date(time_entry.created_at) > oneWeekAgo;
    });
    var rev_this_year = _.reduce(entries_this_year, function(memo, time_entry) {
      return memo + time_entry.hourly_rate * (time_entry.minutes / 60.0);
    }, 0);
    var rev_last_4_weeks = _.reduce(entries_last_4_weeks, function(memo, time_entry) {
      return memo + time_entry.hourly_rate * (time_entry.minutes / 60.0);
    }, 0);
    var rev_per_day_in_last_4_weeks = rev_last_4_weeks / 28;
    var rev_last_week = _.reduce(entries_last_week, function(memo, time_entry) {
      return memo + time_entry.hourly_rate * (time_entry.minutes / 60.0);
    }, 0);
    var rev_per_day_in_last_week = rev_last_week / 7;

    var projection_per_year = Math.round(rev_this_year * (getDaysInCurrentYear() / getDayInCurrentYear() / 100.0));
    var projection_per_last_4_weeks = Math.round((rev_this_year + rev_per_day_in_last_4_weeks * days_remaining_this_year) / 100.0);
    var projection_per_last_7_days = Math.round((rev_this_year + rev_per_day_in_last_week * days_remaining_this_year) / 100.0);
    var current_revenue = Math.round(rev_this_year / 100.0)

    resultCallback(projection_per_year, projection_per_last_4_weeks, projection_per_last_7_days, current_revenue);
  });
};

// START

var env_variables = ["CLIENT_ID", "CLIENT_SECRET", "VERIFICATION_TOKEN", "MITE_API_KEY", "PORT"]

for (i in env_variables) {
  env_var = env_variables[i]
  if (!process.env[env_var]) {
    printHelp(env_var)
    process.exit(1)
  }
}

var config = {}
if (process.env.MONGODB_URI) {
  var BotkitStorage = require('botkit-storage-mongo');
  config = {
    storage: BotkitStorage({mongoUri: process.env.MONGODB_URI}),
  };
} else {
  config = {
    json_file_store: './db_slackbutton_slash_command/',
  };
}

var controller = Botkit.slackbot(config).configureSlackApp(
  {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    scopes: ['commands'],
  }
);

var mite = miteAPI(
  {
    account: 'creativepragmatics',
    apiKey: process.env.MITE_API_KEY,
    applicationName: 'MiteRevenueReport4Slack'
  }
);

controller.setupWebserver(process.env.PORT, function (err, webserver) {
  controller.createWebhookEndpoints(controller.webserver);

  controller.createOauthEndpoints(controller.webserver, function (err, req, res) {
    if (err) {
      res.status(500).send('ERROR: ' + err);
    } else {
      res.send('Success! Now go to Slack and type /revenue');
    }
  });
});


controller.on('slash_command', function (slashCommand, message) {

  switch (message.command) {
    case "/revenue":
    // ignore the message if the token does not match.
    if (message.token !== process.env.VERIFICATION_TOKEN) return;

    if (message.text == "") {

      getFinancialMetrics(
        function(projection_per_year, projection_per_last_4_weeks, projection_per_last_7_days, rev_this_year) {
          yearly = Math.round(projection_per_year / 1000)
          monthly = Math.round(projection_per_last_4_weeks / 1000)
          weekly = Math.round(projection_per_last_7_days / 1000)

          report =  "Revenue: *EUR " + rev_this_year + "*"
          report += "\n\n_Projection_\n"
          report += "Year: *EUR " + yearly + "K*\n"
          report += "Last Month: *EUR " + monthly + "K*\n"
          report += "Last Week: *EUR " + weekly + "K*"

          var result = {
            "text": report,
            "username": "MiteRevenueReport4Slack",
            "mrkdwn": true
          }

          slashCommand.replyPublic(message, result, function() {
            if (shouldDisplayFeedback()) {
              setTimeout(function() {
                var feedback = getFeedback(yearly)
                slashCommand.replyPublicDelayed(message, feedback)
              }, (Math.floor(Math.random() * 3) + 1) * 1000 )
            }
          })
        }
      );

    }

    break

    default:
    slashCommand.replyPrivate(message, "/shrug I am sorry, but I have no idea what this means " + message.command)

  }

});
