const bcrypt = require('bcryptjs');
const password = '00000007';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);
console.log(hash);
