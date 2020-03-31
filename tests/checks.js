/* eslint-disable no-invalid-this*/
/* eslint-disable no-undef*/
// IMPORTS
const path = require("path");
const Utils = require("./testutils");
const spawn = require("child_process").spawn;
const fs = require("fs");

const process = require("process")
var Git = require("nodegit");


const DEBUG =  typeof process.env.DEBUG !== "undefined";
const WAIT =  typeof process.env.WAIT !== "undefined"?parseInt(process.env.WAIT):50000;

const path_assignment = path.resolve(path.join(__dirname, "../", "quiz_2020"));
const URL = `file://${path_assignment.replace("%", "%25")}`;
const browser = new Browser({"waitDuration": WAIT, "silent": true});

// CRITICAL ERRORS
let error_critical = null;


var orig_it = it;

// Cambiar si cambia el seeder
const questions = [
    {
        question: 'Capital of Italy',
        answer: 'Rome',
    },
    {
        question: 'Capital of Portugal',
        answer: 'Lisbon',
    },
    {
        question: 'Capital of Spain',
        answer: 'Madrid',
    },
    {
        question: 'Capital of France',
        answer: 'Paris',
    }
]


it = function(name, score, func) {
    return orig_it(name, async function () {
        let critical = score < 0;
        this.score = critical? 0 :score;
        this.msg_ok = null;
        this.msg_err = null;
        if(error_critical) {
            this.msg_err = "Un test crítico ha fallado, no podemos continuar hasta que pasen todos los tests críticos.";
            throw Error(this.msg_err);
        }
        try {
            res = await func.apply(this, [])
            if (!this.msg_ok){
                this.msg_ok =  "¡Enhorabuena!";
            }
            return;
        } catch(e){
            if(critical) {
            }
            if (DEBUG) {
                console.log("Exception in test:", e);
            }
            if (!this.msg_err){
                this.msg_err =  "Ha habido un fallo";
            }
            error_critical = this.msg_err;
            throw(e);
        }
    })
}

describe("Prechecks", function () {
    it("1: Comprobando que existe el fichero de la entrega...",
       0,
       async function () {
           this.msg_ok = `Encontrado el fichero '${path_assignment}'`;
           this.msg_err = `No se encontró el fichero '${path_assignment}'`;
           const fileexists = await Utils.checkFileExists(path_assignment);

           if (!fileexists) {
               error_critical = this.msg_err;
           }
           fileexists.should.be.equal(true);
       });

    it("1: Comprobando que existe la rama entrega9",
       0,
       async function () {
           this.msg_err = "No se encuentra la rama entrega9"
           repo = await Git.Repository.open(path_assignment);
           commit = await repo.getBranchCommit("entrega9")
       });

	it(`2: Comprobar que se han añadido plantillas express-partials`,
     0,
     async function () {
		this.msg_ok = 'Se incluye layout.ejs';
		this.msg_err = 'No se ha encontrado views/layout.ejs';
		this.score = 0;
		fs.existsSync(path.join(path_assignment, "views", "layout.ejs")).should.be.equal(true);
	});

	it(`3: Comprobar que la migración y el seeder existen`,
     0,
     async function () {

         let files = [
             ['migrations', '-CreateGroupsTable.js'],
             ['migrations', '-CreateGroupQuizzesTable.js'],
             ['seeders', '-FillGroupsTable.js'],
         ]
         for (var [folder, suffix] of files) {
             this.msg_er = `La carpeta ${folder} no tiene un fichero acabado en ${suffix}`
             let file = fs.readdirSync(path.join(path_assignment, folder)).filter(fn => fn.endsWith(suffix));
		         (file.length).should.be.equal(1);
         }
	});

	it(`4: Comprobar que los controladores existen`,
     0,
     async function () {
		this.msg_err = "No se incluye el controlador de groups";

		quiz = require(path.resolve(path.join(path_assignment, 'controllers', 'group')));
		quiz.index.should.not.be.undefined;
	})
});

describe("Comprobación de ficheros", function () {
	it(`5: Comprobar que las plantillas express-partials tienen los componentes adecuados`,
     1,
     async function () {
		this.msg_ok = 'Se incluyen todos los elementos necesarios en la plantilla';
		this.msg_err = 'No se ha encontrado todos los elementos necesarios';
         let checks = {
             "layout.ejs": {
                 true: [/<%- body %>/g, /<header/, /<\/header>/, /<nav/, /<\/nav>/, /<footer/, /<\/footer>/]
             },
             [path.join("groups", "index.ejs")]: {
                 true: [/<h1>[ \n\t\r^M]*Groups:[ \n\t\r^M]*<\/h1>/],
             },
             [path.join("groups", "edit.ejs")]: {
                 true: [/Configure Group/],
             },
             [path.join("groups", "new.ejs")]: {
                 true: [/<form method="post" action="\/groups">/]
             },
             [path.join("groups", "random_play.ejs")]: {
                 true: [/Group Play/],
             },
             [path.join("groups", "random_nomore.ejs")]: {
                 true: [/End of Group Play/],
             },
             [path.join("groups", "random_result.ejs")]: {
                 true: [/You have succeeded/, /You have failed/],
             },
         }

		for (fpath in checks) {
			let templ = fs.readFileSync(path.join(path_assignment, "views", fpath), "utf8");
			for(status in checks[fpath]) {
				elements = checks[fpath][status]
				for(var elem in elements){
					let e = elements[elem];
					if (status) {
						this.msg_err = `${fpath} no incluye ${e}`;
					} else {
						this.msg_err = `${fpath} incluye ${e}, pero debería haberse borrado`;
					}
					e.test(templ).should.be.equal((status == 'true'));
				}
			}
		}
	});
});


describe("Funcionales", function(){

    // Hay que dejar al admin el último para la operación de DELETE
    var users = [
        {
            username: 'pepe',
            password: '5678',
            admin: false,
        },
        {
            username: 'admin',
            password: '1234',
            admin: true,
        },
    ]
    const cookie_name = 'connect.sid';
    var cookies = {};

    var server;
    const db_file = path.join(path_assignment, '..', 'quiz.sqlite');

    before(async function() {
        if(error_critical) {
            return;
        }
        // Crear base de datos nueva y poblarla antes de los tests funcionales. por defecto, el servidor coge quiz.sqlite del CWD
        fs.closeSync(fs.openSync(db_file, 'w'));

        let sequelize_cmd = path.join(path_assignment, "node_modules", ".bin", "sequelize")
        await exec(`${sequelize_cmd} db:migrate --url "sqlite://${db_file}" --migrations-path ${path.join(path_assignment, "migrations")}`)
        await exec(`${sequelize_cmd} db:seed:all --url "sqlite://${db_file}" --seeders-path ${path.join(path_assignment, "seeders")}`)


        server = spawn('node', [path.join(path_assignment, "bin", "www")]);
        await new Promise(resolve => setTimeout(resolve, 1000));
        browser.site = "http://localhost:3000/"

        // Login with user and 

        for(var key in users) {
            let user = users[key];

            await browser.visit("/login/");
            await browser.fill('username', user.username);
            await browser.fill('password', user.password);
            await browser.pressButton('Login');

            user.cookie = browser.getCookie(cookie_name);
            browser.deleteCookie(cookie_name);
        }
    });

    async function asUser(username, fn) {
        let user = users[username];
        browser.setCookie(cookie_name, user.cookie);
        try{
            await fn.apply(this, []);
        }catch(e){
            // Esta parte sólo funciona si se usa asUsers.apply(this, [argumentos]) siempre.
            // y allUsers.apply, si se usa dentro de esa función.
            if(!this.msg_err) {
                this.msg_err = `Fallo con el usuario ${username}`
            } else {
                this.msg_err += `, con el usuario ${username}`
            }
            throw(e)
        }
        browser.deleteCookie(cookie_name);
    }

    async function allUsers(fn) {
        for(var name in users) {
            await asUser.apply(this, [name, async function () {
                return fn.apply(this, [users[name]]);
            }]);
        }
    }

    after(async function() {
        if(error_critical) {
            return;
        }
        // Borrar base de datos
        server.kill();
        fs.unlinkSync(db_file);
    })

    it("6: La lista de grupos incluye un enlace para jugar",
       0.5,
       async function(){ 
           await browser.visit("/groups/");
           browser.assert.status(200)
           browser.assert.text('a[href="/groups/1/randomplay"]', "Geography")
       });

    it("7: Los quizzes se eligen aleatoriamente",
       0.5,
       async function () {
           // Lanzamos 10 intentos de partida, sin cookies. Debería haber más de 2 preguntas diferentes
           this.msg_err = `Se repite el orden de los quizzes`;

           let visited = {}
           let num = 0;

           for(var i=0; i<10; i++) {
               await browser.visit("/groups/1/randomplay");
               browser.assert.status(200)
               att = browser.query('form')
               if(!visited[att.action]) {
                   visited[att.action] = 1;
                   num++;
               } else {
                   visited[att.action]++;
               }
               browser.deleteCookies();
           }

           num.should.be.above(1)
       });

    it("8: No se repiten los quizzes",
       1,
       async function () {
           // Hacer dos partidas, comprobar que el orden de las preguntas es diferente
           this.msg_err = "Se repite un quiz";


           let visited = {}
           let num = 0;

           browser.deleteCookies();

           for(var i=0; i<questions.length; i++) {
               await browser.visit("/groups/1/randomplay");
               browser.assert.status(200)
               att = browser.query('form')
               if(!visited[att.action]) {
                   visited[att.action] = 1;
                   num++;
               } else{
                   throw Error(`Quiz repetido: ${att.action}`)
                   visited[att.action]++;
               }
               let tokens = att.action.split("/")
               let id = parseInt(tokens[tokens.length-1])
               let q = questions[id-1]
               let answer = q.answer
               await browser.visit(`/groups/1/randomcheck/${id}?answer=${answer}`)
           }
       });

    it("9: Se termina si no quedan más quizzes",
       0.5,
       async function () {
           this.msg_ok = "Se han respondido todas las preguntas, y el juego termina correctamente";
           this.msg_err = "Se han respondido todas las preguntas, pero el juego continúa";

           await browser.visit("/groups/1/randomplay");
           att = browser.query('form')
           if(att){
               let tokens = att.action.split("/")
               let id = parseInt(tokens[tokens.length-1])
               this.msg_err = `${this.msg_err} con la pregunta ${id}`
               throw Error(this.msg_err)
           }

           browser.assert.text("section>h1", "End of Group Play: Geography")
       });

    it("10: Si se responde bien, continúa el juego",
       0.5,
       async function () {
           this.msg_err = "No continúa pese a responder bien";

           for(var i=0; i< 10; i++) {
               await browser.visit("/groups/1/randomplay");
               browser.assert.status(200);
               att = browser.query('form');
               let tokens = att.action.split("/");
               const id = parseInt(tokens[tokens.length-1])
               let question = questions[id-1]
               let answer = question.answer
               await browser.visit(`/groups/1/randomcheck/${id}?answer=${answer}`)
               this.msg_err = `No acepta la respuesta correcta para ${question}`
               browser.assert.status(200)
               this.msg_err = `Tras una respuesta correcta, se repite la pregunta`
               await browser.visit("/groups/1/randomplay");
               att = browser.query('form');
               tokens = att.action.split("/")
               new_id = parseInt(tokens[tokens.length-1])
               id.should.not.be.equal(new_id)
               browser.deleteCookies();
           }
       });

    it("11: Al fallar se termina el juego",
       0.5,
       async function () {
           this.msg_err = "Al fallar hay un error";

           browser.deleteCookies();
           await browser.visit("/groups/1/randomplay");
           browser.assert.status(200);
           await browser.visit("/groups/1/randomcheck/1?answer=This answer is wrong")
           browser.assert.status(200);

           this.msg_err = "Al fallar una pregunta no muestra la pantalla correcta";
           browser.assert.text("section>h1", "Group Play: Geography")
           browser.text().includes("You have failed").should.equal(true)
       });

    it("12: Se puntúa bien el número de aciertos",
       0.5,
       async function () {
           this.msg_err = "No continúa pese a responder bien";

           // Repetimos dos veces, para asegurarnos.
           for(var j=0; j<2; j++){
               browser.deleteCookies();
               for(var i=0; i< questions.length; i++) {
                   await browser.visit("/groups/1/randomplay");
                   browser.assert.status(200);
                   att = browser.query('form');
                   let tokens = att.action.split("/");
                   const id = parseInt(tokens[tokens.length-1])
                   let question = questions[id-1]
                   let answer = question.answer
                   await browser.visit(`/groups/1/randomcheck/${id}?answer=${answer}`)
                   this.msg_err = `No acepta la respuesta correcta para ${question}`
                   browser.assert.status(200)
                   const body = browser.text()
                   let num_aciertos = i+1
                   this.msg_err = `Esperaba ${num_aciertos} aciertos, la página muestra ${body}`
                   body.includes(`Successful answers = ${num_aciertos}`).should.equal(true)
               }
           }
       });


    it("13: La lista de grupos sólo muestra opciones de edición al admin",
       2,
       async function() {
           var ctx = this;
           return allUsers(async function(user) {
               await browser.visit("/groups");
               ctx.msg_err = `El usuario ${user.username} no puede ver la lista de grupos correctamente`;
               browser.assert.text("#mainHeader > div.right > a:nth-child(1)", user.username);
               let expected = user.admin? 1 : 0;
               ctx.msg_err = `El usuario ${user.username} ${user.admin?'sí':'no'} debería poder editar`;
               browser.assert.elements('a[href="/groups/1/edit"]', expected);
               browser.assert.elements('a[href="/groups/1?_method=DELETE"]', expected);
           });
       });

    it("14: Sólo un admin puede crear nuevos grupos",
       1,
       async function() {
           var ctx = this;
           return allUsers(async function(user) {
               try{
                   await browser.visit("/groups/new");
               } catch(e){}

               ctx.msg_err = `El usuario ${user.username} ${user.admin?'sí':'no'} debería poder crear nuevos grupos`;

               if(!user.admin) {
                   return browser.assert.status(403);
               }
               browser.assert.status(200);

               await browser.fill('name', `prueba_${user.username}`);
               await browser.pressButton('Save');
               browser.assert.status(200);
           });
       });

    it("15: Sólo un admin puede editar un grupo",
       1,
       async function() {
           var ctx = this;
           return allUsers(async function(user) {
               try{
                   await browser.visit("/groups/1/edit");
               } catch(e){}

               ctx.msg_err = `El usuario ${user.username} ${user.admin?'sí':'no'} debería poder editar grupos`;

               if(!user.admin) {
                   return browser.assert.status(403);
               }
               browser.assert.status(200);
               await browser.pressButton('Save');
               browser.assert.status(200);
           });
       });

    it("16: Sólo un admin puede eliminar un grupo",
       1,
       async function() {
           var ctx = this;
           return allUsers(async function(user) {
               try{
                   await browser.visit("/groups/1/?_method=DELETE");
               } catch(e){}

               ctx.msg_err = `El usuario ${user.username} ${user.admin?'sí':'no'} debería poder eliminar grupos`;

               if(!user.admin) {
                   return browser.assert.status(403);
               }

               browser.assert.status(200);
           });
       });
});