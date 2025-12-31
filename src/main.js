import Test from './test.js'

module.exports.loop = function () {
    console.log('Hello, Screeps!', Game.time);
    Test.runTest();
}