/** \file
 * \brief Wrappers for the Accelerometer Sensor
 *
 * \see https://www.w3.org/TR/accelerometer/
 *
 *  \author Copyright (C) 2021  Radek Hranicky
 *
 *  \license SPDX-License-Identifier: GPL-3.0-or-later
 */
 //
 //  This program is free software: you can redistribute it and/or modify
 //  it under the terms of the GNU General Public License as published by
 //  the Free Software Foundation, either version 3 of the License, or
 //  (at your option) any later version.
 //
 //  This program is distributed in the hope that it will be useful,
 //  but WITHOUT ANY WARRANTY; without even the implied warranty of
 //  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 //  GNU General Public License for more details.
 //
 //  You should have received a copy of the GNU General Public License
 //  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 //

 /** \file
  * \ingroup wrappers
  *
  *
  * WRAPPING
  * For a stationary device lying bottom down on a flat surface, only the `z`
  * axis is affected by gravity. The `x` and `y` axes should be set to zero.
  * Yet, there could be vibrations that may change values a little bit, e.g.,
  * to spin around -0.2 to +0.2. This usually does not happed with every
  * reading but only in intervals of seconds. And thus, after a few seconds
  * we pseudo-randomly change these values.
  *
  *
  * POSSIBLE IMPROVEMENTS
  * Currently, we assume te device is lying on a flat surface bottom down, and
  * thus only the `z` is affected by gravity. As improvement, we can also
  * assume the device is in an oblique position. In this case, the gravitational
  * acceleration would affect two or three axes. Those will have to be updated
  * properly to create a realistic behavior.
  *
  */

  /*
   * Create private namespace
   */
(function() {

  var init_data = `
    var currentReading = currentReading || {orig_x: null, orig_y: null, orig_z: null, timestamp: null,
                      fake_x: null, fake_y: null, fake_z: null};
    var previousReading = previousReading || {orig_x: null, orig_y: null, orig_z: null, timestamp: null,
                      fake_x: null, fake_y: null, fake_z: null};
    var emulateStationaryDevice = (typeof args === 'undefined') ? true : args[0];
    var debugMode = false;

    const TWOPI = 2 * Math.PI;
    `;

  var orig_getters = `
    var origGetX = Object.getOwnPropertyDescriptor(Accelerometer.prototype, "x").get;
    var origGetY = Object.getOwnPropertyDescriptor(Accelerometer.prototype, "y").get;
    var origGetZ = Object.getOwnPropertyDescriptor(Accelerometer.prototype, "z").get;
    var origGetTimestamp = Object.getOwnPropertyDescriptor(Sensor.prototype, "timestamp").get;
    `;

  function shake(axis) {
    val = sen_prng() * (axis.max - axis.min) + axis.min;
    if (axis.canBeNegative) {
      val *= Math.round(sen_prng()) ? 1 : -1;
    }
    axis.value = val.toFixed(axis.decimalPlaces);
  }

  function initDataGenerator() {
    const NEXT_CHANGE_MS_MIN = 1000;
    const NEXT_CHANGE_MS_MAX = 10000;

    dataGen = {
      x: {
        name: "x",
        min: 0.0,
        max: 0.11,
        decimalPlaces: 1,
        canBeNegative: true,
        value: null,
      },
      y: {
        name: "y",
        min: 0.0,
        max: 0.11,
        decimalPlaces: 1,
        canBeNegative: true,
        value: null,
      },
      z: { // "z with gravity" (for Accelerometer)
        name: "z_g",
        min: 9.8,
        max: 9.9,
        decimalPlaces: 1,
        canBeNegative: false,
        value: null,
      },
      z_nograv: { // "z without gravity" (for LinearAccelerationSensor)
        name: "z_ng",
        min: 0.0,
        max: 0.2,
        decimalPlaces: 1,
        canBeNegative: false,
        value: null,
      },
      nextChangeTimeX: null, // miliseconds
      nextChangeTimeY: null,

      // Update x/y/z values based on timestamp
      update: function(currentTimestamp) {
      // Simulate the accelerometer changes
        if (this.shouldWeUpdateX(currentTimestamp)) {
          shake(this.x);
          this.setNextChangeX(currentTimestamp);
        };
        if (this.shouldWeUpdateY(currentTimestamp)) {
          shake(this.y);
          this.setNextChangeY(currentTimestamp);
        };
        shake(this.z);
        shake(this.z_nograv);
      },

      shouldWeUpdateX: function(currentTimestamp) {
        if (currentTimestamp === null || this.nextChangeTimeX === null) {
          return true;
        }
        if (currentTimestamp >= this.nextChangeTimeX) {
          return true;
        } else {
          return false;
        }
      },

      shouldWeUpdateY: function(currentTimestamp) {
        if (currentTimestamp === null || this.nextChangeTimeY === null) {
          return true;
        }
        if (currentTimestamp >= this.nextChangeTimeY) {
          return true;
        } else {
          return false;
        }
      },

      setNextChangeX: function(currentTimestamp) {
        let interval_ms = Math.floor(
          sen_prng() * (NEXT_CHANGE_MS_MAX - NEXT_CHANGE_MS_MIN + 1)
          + NEXT_CHANGE_MS_MIN
        );
        this.nextChangeTimeX = currentTimestamp + interval_ms;
      },

      setNextChangeY: function(currentTimestamp) {
        let interval_ms = Math.floor(
          sen_prng() * (NEXT_CHANGE_MS_MAX - NEXT_CHANGE_MS_MIN + 1)
          + NEXT_CHANGE_MS_MIN
        );
        this.nextChangeTimeY = currentTimestamp + interval_ms;
      }
    }

    return dataGen;
  }

  function updateReadings(sensorObject) {
    // We need the original reading's timestamp to see if it differs
    // from the previous sample. If so, we need to update the faked x,y,z
    let previousTimestamp = previousReading.timestamp;
    let currentTimestamp = origGetTimestamp.call(sensorObject);

    if (debugMode) {
      // [!] Debug mode: overriding timestamp
      // This allows test suites to set a custom timestamp externally
      // by modifying the property of the sensor object directly.
      currentTimestamp = sensorObject.timestamp;
    }

    if (currentTimestamp === previousReading.timestamp) {
      // No new reading, nothing to update
      return;
    }

    // Rotate the readings: previous <- current
    previousReading = JSON.parse(JSON.stringify(currentReading));

    // Update current reading
    // NOTE: Original values are also stored for possible future use
    currentReading.orig_x = origGetX.call(sensorObject);
    currentReading.orig_y = origGetY.call(sensorObject);
    currentReading.orig_z = origGetZ.call(sensorObject);
    currentReading.timestamp = currentTimestamp;

    dataGenerator.update(currentTimestamp);

    currentReading.fake_x = dataGenerator.x.value;
    currentReading.fake_y = dataGenerator.y.value;
    currentReading.fake_z = dataGenerator.z.value;
    currentReading.fake_z_nograv = dataGenerator.z_nograv.value;

    if (debugMode) {
      console.log(dataGenerator);
    }
  }
  var generators = `
    // Get seed for sen_prng: prefer existing seed, then domain hash, session hash

    // Initialize the data generator, if not initialized before
    var dataGenerator = dataGenerator || initDataGenerator();
    `;

  var helping_functions = sensorapi_prng_functions
      + initDataGenerator + shake + updateReadings;
  var hc = init_data + orig_getters + helping_functions + generators;

  var wrappers = [
    {
      parent_object: "Accelerometer.prototype",
      parent_object_property: "x",
      wrapped_objects: [],
      helping_code: hc,
      post_wrapping_code: [
        {
          code_type: "object_properties",
          parent_object: "Accelerometer.prototype",
          parent_object_property: "x",
          wrapped_objects: [],
          /**  \brief replaces Sensor.prototype.x getter to return a faked value
           */
          wrapped_properties: [
            {
              property_name: "get",
              property_value: `
              function() {
                updateReadings(this);
                if (this.__proto__.constructor.name === 'LinearAccelerationSensor') {
                  if (currentReading.fake_x != null) {
                    return 0;
                  }
                }
                return currentReading.fake_x;
              }`,
            },
          ],
        }
      ],
    },
    {
      parent_object: "Accelerometer.prototype",
      parent_object_property: "y",
      wrapped_objects: [],
      helping_code: hc,
      post_wrapping_code: [
        {
          code_type: "object_properties",
          parent_object: "Accelerometer.prototype",
          parent_object_property: "y",
          wrapped_objects: [],
          /**  \brief replaces Sensor.prototype.y getter to return a faked value
           */
          wrapped_properties: [
            {
              property_name: "get",
              property_value: `
              function() {
                updateReadings(this);
                if (this.__proto__.constructor.name === 'LinearAccelerationSensor') {
                  if (currentReading.fake_y != null) {
                    return 0;
                  }
                }
                return currentReading.fake_y;
              }`,
            },
          ],
        }
      ],
    },
    {
      parent_object: "Accelerometer.prototype",
      parent_object_property: "z",
      wrapped_objects: [],
      helping_code: hc,
      post_wrapping_code: [
        {
          code_type: "object_properties",
          parent_object: "Accelerometer.prototype",
          parent_object_property: "z",
          wrapped_objects: [],
          /**  \brief replaces Sensor.prototype.z getter to return a faked value
           */
          wrapped_properties: [
            {
              property_name: "get",
              property_value: `
              function() {
                updateReadings(this);
                if (this.__proto__.constructor.name === 'GravitySensor') {
                  if (currentReading.fake_z != null) {
                    return (currentReading.fake_z - currentReading.fake_z_nograv);
                  }
                }
                return currentReading.fake_z_nograv;
              }`,
            },
          ],
        }
      ],
    },
  ]
    add_wrappers(wrappers);
})()
