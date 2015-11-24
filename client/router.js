Router.configure({
	layoutTemplate: 'layout'
});
Router.map(function(){
	this.route('home',{path:'/'});
	this.route('carDisplay',{path:'/carDisplay'});
	this.route('addCarForm',{path:'/add'});
	this.route('searchBox',{path:'/find'});
	this.route('carPage',{path:'/car'});
});