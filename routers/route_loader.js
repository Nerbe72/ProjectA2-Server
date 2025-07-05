var route_loader = {};

var config = require('./config');

route_loader.init = function(app, router){
    console.log('route_loader.init');
    return initRoutes(app, router);
};

function initRoutes(app, router)
{
    var infoLength = config.route_info.length;
    console.log('router count: %d', infoLength);
    
    for (var i = 0; i < infoLength; i++)
    {
        var currentItem = config.route_info[i];
        
        var currentModule = require(currentItem.file);
        console.log('%s load file', currentItem.file);
        
        if (currentItem.type == 'get'){
            router.route(currentItem.path).get(currentModule[currentItem.method]);
        }else if (currentItem.type == 'post'){
            router.route(currentItem.path).post(currentModule[currentItem.method]);
        }else{
            router.route(currentItem.path).put(currentModule[currentItem.method]);
        }
        
        console.log('route [%s] set', currentItem.method);
    }
    
    app.use('/', router);
}

module.exports = route_loader;