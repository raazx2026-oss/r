package com.zikr;

public class Post {
    public String title;
    public String imageUrl;
    public String htmlContent;

    // Firebase ke liye empty constructor zaroori hota hai
    public Post() {}

    public Post(String title, String imageUrl, String htmlContent) {
        this.title = title;
        this.imageUrl = imageUrl;
        this.htmlContent = htmlContent;
    }
}
