Router.configure({
	layoutTemplate: 'layout'
});
Router.map(function(){
	this.route('home',{path:'/'});
	this.route('carDisplay',{path:'/carDisplay'});
	this.route('addCarForm',{path:'/addCarForm'});
});

