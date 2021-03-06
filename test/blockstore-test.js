/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const Block = require('ipfs-block')
const CID = require('cids')
const parallel = require('async/parallel')
const waterfall = require('async/waterfall')
const each = require('async/each')
const map = require('async/map')
const _ = require('lodash')
const multihashing = require('multihashing-async')
const Buffer = require('safe-buffer').Buffer

module.exports = (repo) => {
  describe('blockstore', () => {
    const blockData = _.range(100).map((i) => Buffer.from(`hello-${i}-${Math.random()}`))
    const bData = Buffer.from('hello world')
    let b

    before((done) => {
      multihashing(bData, 'sha2-256', (err, h) => {
        if (err) {
          return done(err)
        }

        b = new Block(bData, new CID(h))
        done()
      })
    })

    describe('.put', () => {
      it('simple', (done) => {
        repo.blocks.put(b, done)
      })

      it('multi write (locks)', (done) => {
        parallel([
          (cb) => repo.blocks.put(b, cb),
          (cb) => repo.blocks.put(b, cb)
        ], done)
      })

      it('empty value', (done) => {
        const d = new Buffer(0)
        multihashing(d, 'sha2-256', (err, multihash) => {
          expect(err).to.not.exist()
          const empty = new Block(d, new CID(multihash))
          repo.blocks.put(empty, done)
        })
      })

      it('massive multiwrite', function (done) {
        this.timeout(15000) // add time for ci
        waterfall([
          (cb) => map(_.range(100), (i, cb) => {
            multihashing(blockData[i], 'sha2-256', cb)
          }, cb),
          (hashes, cb) => each(_.range(100), (i, cb) => {
            const block = new Block(blockData[i], new CID(hashes[i]))
            repo.blocks.put(block, cb)
          }, cb)
        ], done)
      })

      it('.putMany', function (done) {
        this.timeout(15000) // add time for ci
        waterfall([
          (cb) => map(_.range(50), (i, cb) => {
            const d = new Buffer('many' + Math.random())
            multihashing(d, 'sha2-256', (err, hash) => {
              if (err) {
                return cb(err)
              }
              cb(null, new Block(d, new CID(hash)))
            })
          }, cb),
          (blocks, cb) => {
            repo.blocks.putMany(blocks, (err) => {
              expect(err).to.not.exist()
              map(blocks, (b, cb) => {
                repo.blocks.get(b.cid, cb)
              }, (err, res) => {
                expect(err).to.not.exist()
                expect(res).to.be.eql(blocks)
                cb()
              })
            })
          }
        ], done)
      })

      it('returns an error on invalid block', (done) => {
        repo.blocks.put('hello', (err) => {
          expect(err).to.exist()
          done()
        })
      })
    })

    describe('.get', () => {
      it('simple', (done) => {
        repo.blocks.get(b.cid, (err, block) => {
          expect(err).to.not.exist()
          expect(block).to.be.eql(b)
          done()
        })
      })

      it('massive read', function (done) {
        this.timeout(15000) // add time for ci
        parallel(_.range(20 * 100).map((i) => (cb) => {
          const j = i % blockData.length
          waterfall([
            (cb) => multihashing(blockData[j], 'sha2-256', cb),
            (h, cb) => {
              const cid = new CID(h)
              repo.blocks.get(cid, cb)
            },
            (block, cb) => {
              expect(block.data).to.be.eql(blockData[j])
              cb()
            }
          ], cb)
        }), done)
      })

      it('returns an error on invalid block', (done) => {
        repo.blocks.get('woot', (err, val) => {
          expect(err).to.exist()
          expect(val).to.not.exist()
          done()
        })
      })
    })

    describe('.has', () => {
      it('existing block', (done) => {
        repo.blocks.has(b.cid, (err, exists) => {
          expect(err).to.not.exist()
          expect(exists).to.eql(true)
          done()
        })
      })

      it('non existent block', (done) => {
        repo.blocks.has(new CID('QmbcpFjzamCj5ZZdduW32ctWUPvbGMwQZk2ghWK6PrKswE'), (err, exists) => {
          expect(err).to.not.exist()
          expect(exists).to.eql(false)
          done()
        })
      })
    })

    describe('.delete', () => {
      it('simple', (done) => {
        waterfall([
          (cb) => repo.blocks.delete(b.cid, cb),
          (cb) => repo.blocks.has(b.cid, cb)
        ], (err, exists) => {
          expect(err).to.not.exist()
          expect(exists).to.equal(false)
          done()
        })
      })
    })
  })
}
