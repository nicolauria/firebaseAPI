const functions = require('firebase-functions');
const admin = require('firebase-admin');

// initialize firebase application
var serviceAccount = require("./service-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://fir-api-7828d.firebaseio.com"
});
var db = admin.firestore();

// build express server
const express = require('express');
const app = express();

// parse body of post requests
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// authenticate REST APIS
const passport = require('passport');
require('./config/passport')(passport);
app.use(passport.initialize());
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// create resusable reference to users collection
const users = db.collection('users');

// input validation
const validateRegisterInput = require('./validation/register');
const validateLoginInput = require('./validation/login');

// @route   POST /login
// @desc    Login a user
// @access  Public
app.post('/login', (req, res) => {
  const { errors, isValid } = validateLoginInput(req.body);

  // check validation
  if (!isValid) {
    return res.status(400).json(errors)
  }

  const email = req.body.email;
  const password = req.body.password;

  // find user by email
  users.where('email', '==', req.body.email).get()
    .then(result => {
      const user = result.docs[0].data();
      const docId = result.docs[0].id;
      if (!user) {
        errors.email = 'User not found';
        res.status(404).json(errors);
      }
      // check password
      bcrypt.compare(password, user.password)
        .then(isMatch => {
          if (isMatch) {
            const payload = { id: docId, email: user.email };
            jwt.sign(payload, 'secret', { expiresIn: 3600 }, (err, token) => {
              return res.json({ success: true, token: 'Bearer ' + token });
            })
          } else {
            errors.password = 'Password incorrect';
            return res.status(400).json(errors);
          }
        })
    })
    .catch(err => console.log(err));
})

// @route   POST /register
// @desc    Register a user
// @access  Public
app.post('/register', (req, res) => {
  const { errors, isValid } = validateRegisterInput(req.body);

  // check validation
  if (!isValid) {
    return res.status(400).json(errors)
  }

  users.where('email', '==', req.body.email).get()
    .then(user => {
      if (user.docs.length > 0) {
        errors.email = 'Email already exists';
        return res.status(400).json(errors);
      } else {
        const newUser = {
          email: req.body.email,
          password: req.body.password,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        bcrypt.genSalt(10, (err, salt) => {
          bcrypt.hash(newUser.password, salt, (err, hash) => {
            if (err) throw err;
            newUser.password = hash;
            users.doc().set(newUser).then(user => {
              return res.send('success');
            })
            .catch(err => console.log(err));
          })
        })
      }
    })
    .catch(err => console.log(err));
});

// @route   GET /api/users/:start/:end
// @desc    Retrieve user profiles
// @access  Private
app.get('/api/users/:id', passport.authenticate('jwt', { session: false }), (req, res) => {
  users.doc(req.params.id).get().then(user => {
    users.orderBy("createdAt").startAfter(user).limit(50).get()
    .then(userResults => {
      if (userResults.size < 0) {
        console.log('No such document!');
      } else {
        const data = userResults.docs.map(function (doc) {
          return { id: doc.id, data: doc.data() };
        });
        return res.json(data);
      }
    })
  })
  .catch(err => console.log(err));
});

exports.app = functions.https.onRequest(app);
