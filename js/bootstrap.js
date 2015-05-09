hw2.include([
    "hw2!js/app/engine.js"
]).define(function (engine) {
    var $ = this;

    $.include([
        "js/app/routes.js",
        "config.js",
        "js/app/npc.js",
        "js/app/item.js",
        "js/app/quest.js"
    ]).then(function () {
        try {
            $.global.angular.resumeBootstrap(["engine"]);
        } catch (e) {
            console.log(e.stack);
        }
    });

});


