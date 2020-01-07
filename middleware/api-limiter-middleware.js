const { promisify } = require('util')
const client = require('../redis')
//import apikey config for read/write/update of reset_date in api_keys table
const db = require('../api-key/dbConfig')


client.get = promisify(client.get)

const CALL_LIMIT = 10000 // change as needed
// const CALL_LIMIT = 3 // test

module.exports = async (req, res, next) => {
  //get api key and role and user_id from req/req headers

  console.log(req.key);
  const { key } = req;
  const { role } = req.headers;
  const { userId } = req;
  // const role = 'freeUser'; //testing, remove this

  if (role === 'freeUser') {

    //retrieve reset_start_date from api-key table
      const resetStart = await db('apiKeys')
      .select('reset_date')
      .where({user_id:userId});

    //generate todays date in milliseconds
      const currentDate = new Date();
      console.log(resetStart[0].reset_date);
      console.log(currentDate);
      const currentDateMS = currentDate.getTime();
      console.log(currentDateMS);

    //calculate the elapsed days
      const elapsedDays = Number(currentDateMS) - Number(resetStart[0].reset_date);
      console.log(elapsedDays);
      const currentPeriod = elapsedDays/(1000*3600*24);
      console.log(currentPeriod);


    // test if the period exceeds 30 days. If so, reset the count in redis, update the reset_date to the current date in milliseconds 

      if (currentPeriod > 30){
        await client.set(key, 0);

        await db('apiKeys')
        .where({user_id:userId})
        .update({reset_date:currentDateMS})
      }

    //retrieve count from redis
      const calls = await client.get(key) // Retrieve key usage from redis cache


    //enforce quotas
      if (calls) {
        if (calls < CALL_LIMIT) {
          const newCalls = Number(calls) + 1
          


          client.set(key, newCalls) // Update # of calls in redis cache


          //TODO BAO PLEASE REMOVE THIS. THIS IS FOR TESTING:  
          console.log(`Api Call Count`, await client.get(key))
          next()
        } else
          res.status(403).json({
            message: `Key: ${key} has exceeded the call limit of ${CALL_LIMIT} calls`
          })
      } else {
        client.set(key, 0) // Create a new key in redis cache
        next()
      }
  } else {
    next()
  }
};


/*

* added date_generated column
* added logic to create a new date and write to
  table so that we can calculate quota reset in Apikeyroute

* algorithm for calculating dates: 
  1) get date generated (in milliseconds) from table
  2) get today's date in milliseconds
  3)  
    todays_date - date generated --> yeilds differential in milliseconds

    dateRange = differential/1000*60*60*24

    if dateRange > 30, reset count in redis

    if dateRange > 30, update reset_start date to today's date. 

*/