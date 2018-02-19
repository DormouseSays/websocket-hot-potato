var storage = {
    get: function(tag){
        return localStorage.getItem(tag);
    },
    set: function(tag, value) {
        localStorage.setItem(tag, value);
    },
    remove: function(tag){
        localStorage.removeItem(tag);
    },
    available: function () {
        var test = 'test';
        try {
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }
}