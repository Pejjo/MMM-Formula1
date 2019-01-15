
/* MMM-Formula1
 * Node Helper
 *
 * By Ian Perrin http://github.com/ianperrin/MMM-Formula1
 * MIT Licensed.
 */

var ErgastAPI = require("./ErgastAPI.js");
const NodeHelper = require("node_helper");
var ical;
var raceScheduleDB = false;
const request = require("request")
const moment = require("moment")
const querystring = require("querystring")
const bodyParser = require("body-parser")
var convert = require('xml-js')

module.exports = NodeHelper.create({

    // Subclass start method.
    start: function() {
        console.log("Starting module: " + this.name);
        this.config = {};
        this.fetcherRunning = false;
        this.driverStandings = false;
        this.constructorStandings = false;
	this.tasks=false;
    },

    // Subclass socketNotificationReceived received.
    socketNotificationReceived: function(notification, payload) {
        console.log(this.name + " received a notification: " + notification);
        if (notification === "CONFIG") {
            
            this.config = payload;
            
            if (this.config.calendar) {
                ical = require("ical-generator");
                this.fetchSchedule();
                this.expressApp.get("/" + this.name + "/schedule.ics", this.serverSchedule);
            }

            if (!this.fetcherRunning) {
                this.fetchStandings();
            }

            if (this.driverStandings) {
                this.sendSocketNotification('DRIVER_STANDINGS', this.driverStandings);
            }

            if (this.constructorStandings) {
                this.sendSocketNotification('CONSTRUCTOR_STANDINGS', this.constructorStandings);
            }
            if (this.tasks) {
                this.sendSocketNotification('TASK_LIST', this.tasks);
            }

        }
    },

    /**
     * fetchStandings
     * Request driver or constructor standings from the Ergast MRD API and broadcast it to the MagicMirror module if it's received.
     */
    fetchStandings: function() {
        console.log(this.name + " is fetching " + (this.config.type === 'DRIVER' ? 'driver' : 'constructor') + " standings");

    var cb = function(result, config, query) {
      var ret = []
        //console.log(result)   // Json
//      for (var property in result.feed.entry[0]) {
//      console.log(property);
//      }
      for (j in result.feed.entry) {
        console.log(j);
        var task = result.feed.entry[j]
        var time = moment(task.updated._text)
        console.log(time);
//        if (config.timeFormat == "relative") {
        task.updated = time.format(config.timeFormat)
        task.source  = "redmine"
        task.author  = task.author.name._text
        console.log(task.author)
        task.title = task.title._text
        console.log(task.title)
        task.content = task.content._text.replace(/<(?:.|\n)*?>/gm, '')
        console.log(task.content)

        ret.push(task)
      }
      return ret
    }

    var getRequest = function(url, query, cfg) {
      return new Promise((resolve, reject)=>{
        request(url, (error, response, body)=> {
          if (error) {
            var e = ""
            reject(e)
          } else {
            var result = JSON.parse(convert.xml2json(body, {compact: true, spaces: 2}))
            if (result.status == "error") {
              var e = "result.code" + ":" + result.message
              reject(e)
            } else {
              resolve(result)
            }
          }
        })
      })
    }

    var getTasks = async (url, query, cfg) => {
      try {
        var ret = await getRequest(url, query, cfg)
        var result = cb (ret, cfg, query)
//	console.log(result);
//        if (result.length > 0) {
          this.tasks = result
//        }
//        count--
//        if (count <= 0) {
//          count = this.pool.length
//          this.finishPooling()
//          return true
//        }
        return result
      } catch (error) {
        console.log ("[Redmine] Error : ", url, error)
        return false
      }
    }

        var self = this;
        this.fetcherRunning = true;
	this.tasks = []
	var query = null
	var url = this.config.url

        var type = this.config.type === 'DRIVER' ? 'driverStandings' : 'constructorStandings';
	this.tasks=getTasks(url, query, this.config)
        ErgastAPI.getStandings(this.config.season, type, function(standings) {
//            if (this.tasks) {
 	console.log(JSON.stringify(self.tasks))
                self[type] = standings;
//                self.sendSocketNotification(self.config.type + '_STANDINGS', this.tasks);
		self.sendSocketNotification('TASK_LIST', self.tasks);
//            }
		
            setTimeout(function() {
                self.fetchStandings();
//		getArticles(url, query, this.config, this.articles)
            }, self.config.reloadInterval);
        });
    },

    /**
     * fetchSchedule
     * Request current race schedule from the Ergast MRD API and broadcast as an iCal
     */
    fetchSchedule: function() {
        console.log(this.name + " is fetching the race schedule");
        var self = this;
//        this.fetcherRunning = true;
        ErgastAPI.getSchedule(this.config.season, function(raceSchedule) {
            if (raceSchedule && raceSchedule.updated) {
                raceScheduleDB = raceSchedule;
                self.sendSocketNotification('RACE_SCHEDULE', raceSchedule);
            }

            setTimeout(function() {
                self.fetchSchedule();
            }, self.config.reloadInterval);
        });
    },

    /**
     * serverSchedule
     * Publish race schedule as an iCal
     */
    serverSchedule: function(req, res) {
        console.log("Serving the race schedule iCal");
            var cal = ical({domain: "localhost", name: "Formula1 Race Schedule"});
            if (raceScheduleDB.updated && raceScheduleDB.MRData.RaceTable.Races) {
                var races = raceScheduleDB.MRData.RaceTable.Races
                for (i = 0; i < races.length; i++) {
                    // Parse date/time
                    var utcDate = races[i].date + "T" + races[i].time;
                    var startDate = Date.parse(utcDate);
                    if (startDate && startDate != NaN) {
                        // Create Event
                        cal.createEvent({
                            start: new Date(startDate),
                            end: new Date(startDate),
                            summary: races[i].raceName,
                            location: races[i].Circuit.circuitName,
                            url: races[i].url,
                        });
                    }
                }
            }
            cal.serve(res);
    }


});
