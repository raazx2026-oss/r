package com.zikr;

public class QuizQuestion {
    public String question, opt1, opt2, opt3, answer;

    public QuizQuestion() {} // Firebase ke liye zaroori hai

    public QuizQuestion(String question, String opt1, String opt2, String opt3, String answer) {
        this.question = question;
        this.opt1 = opt1;
        this.opt2 = opt2;
        this.opt3 = opt3;
        this.answer = answer;
    }
}
