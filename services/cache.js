const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');

const redisUrl = 'redis://localhost:6379'

const client = redis.createClient(redisUrl)

const exec = mongoose.Query.prototype.exec;

client.hget = util.promisify(client.hget);

mongoose.Query.prototype.cache = function (options = {}) {
    this._cache = true
    this._cacheKey = JSON.stringify(options.key || '')
    return this
}

mongoose.Query.prototype.exec = async function () {
    if (this._cache) {
        const key = JSON.stringify(Object.assign({}, this.getQuery(), {
            collection: this.mongooseCollection.name
        }));

        const cacheValue = await client.hget(this._cacheKey, key);

        if (cacheValue) {
            console.log('SERVING FROM CACHE')
            const doc = JSON.parse(cacheValue);

            return Array.isArray(doc)
                ? doc.map(d => new this.model(d))
                : new this.model(doc);
        }

        console.log('SERVING FROM MONGODB')

        const result = await exec.apply(this, arguments);

        client.hset(this._cacheKey, key, JSON.stringify(result));

        return result;
    }

    return exec.apply(this, arguments);
}

module.exports = {
    clearHash: function (hashKey) {
        client.del(JSON.stringify(hashKey));
    }
}