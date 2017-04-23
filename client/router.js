Router.configure({
	layoutTemplate: 'layout'
});
Router.map(function(){
	this.route('home',{path:'/'});
	this.route('carDisplay',{path:'/carDisplay'});
	this.route('addCarForm',{path:'/add'});
	this.route('searchBox',{path:'/find'});
	this.route('carPage',{path:'/car'});
	this.route('manage',{path:'/manage'});
	this.route('browseCars',{path:'/browse'});

	this.route('linkTest',{path:'/links'});

});
//SCROLL TO TOP- NEED TO IMPLEMENT JUST PUTTING HERE TEMPORARILY
// Meteor.Router.filters({
//     resetScroll: function(page) {
//         if (!(page===Session.get('Router.lastPage'))) {
//             Session.set('Router.lastPage',page);
//             Meteor.startup(function() {window.scrollTo(0,0)});
//         }
//         return page;
//     }
// });

// Meteor.Router.filter('resetScroll'); // Active for all the pages