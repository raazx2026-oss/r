package com.zikr;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RadioButton;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

import com.zikr.databinding.ActivityQuizBinding;

import java.util.ArrayList;
import java.util.List;

public class QuizActivity extends AppCompatActivity {
    
    private ActivityQuizBinding binding;
    private DatabaseReference mDatabase;
    
    private List<QuizQuestion> questionList = new ArrayList<>();
    private int currentQuestionIndex = 0;
    private int score = 0;
    private String rewardUrl = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityQuizBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        mDatabase = FirebaseDatabase.getInstance().getReference("app_settings");

        // 1. Fetch Reward URL
        mDatabase.child("quiz_reward_url").addListenerForSingleValueEvent(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                if(snapshot.exists()) rewardUrl = snapshot.getValue(String.class);
            }
            @Override public void onCancelled(@NonNull DatabaseError error) {}
        });

        // 2. Fetch All Questions
        mDatabase.child("daily_quiz").addListenerForSingleValueEvent(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                questionList.clear();
                if (snapshot.exists()) {
                    for (DataSnapshot snap : snapshot.getChildren()) {
                        QuizQuestion q = snap.getValue(QuizQuestion.class);
                        if (q != null) questionList.add(q);
                    }
                    if (!questionList.isEmpty()) {
                        loadQuestion();
                    }
                } else {
                    binding.tvQuestion.setText("No Quiz Available Today!");
                    binding.btnSubmit.setEnabled(false);
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                Toast.makeText(QuizActivity.this, "Error loading quiz", Toast.LENGTH_SHORT).show();
            }
        });

        // 3. Submit / Next Button Logic
        binding.btnSubmit.setOnClickListener(v -> {
            int selectedId = binding.radioGroup.getCheckedRadioButtonId();

            if (selectedId == -1) {
                Toast.makeText(this, "Please select an option!", Toast.LENGTH_SHORT).show();
                return;
            }

            // Check Answer
            RadioButton selectedRadioButton = findViewById(selectedId);
            String selectedAnswer = selectedRadioButton.getText().toString();
            String correctAnswer = questionList.get(currentQuestionIndex).answer;

            if (selectedAnswer.equals(correctAnswer)) {
                score++;
            }

            currentQuestionIndex++;

            if (currentQuestionIndex < questionList.size()) {
                // Load Next Question
                loadQuestion();
            } else {
                // Quiz Finished! Show Results
                showFinalResult();
            }
        });

        // 4. Reward Button Click
        binding.btnClaimReward.setOnClickListener(v -> {
            if(!rewardUrl.isEmpty()) {
                // Ensure URL has http/https
                if (!rewardUrl.startsWith("http://") && !rewardUrl.startsWith("https://")) {
                    rewardUrl = "http://" + rewardUrl;
                }
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(rewardUrl));
                startActivity(browserIntent);
            } else {
                Toast.makeText(this, "Reward URL not set by Admin", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void loadQuestion() {
        binding.radioGroup.clearCheck();
        QuizQuestion q = questionList.get(currentQuestionIndex);
        
        binding.tvProgress.setText("Question " + (currentQuestionIndex + 1) + " of " + questionList.size());
        binding.tvQuestion.setText(q.question);
        binding.rbOption1.setText(q.opt1);
        binding.rbOption2.setText(q.opt2);
        binding.rbOption3.setText(q.opt3);

        if (currentQuestionIndex == questionList.size() - 1) {
            binding.btnSubmit.setText("Submit Quiz");
        }
    }

    private void showFinalResult() {
        binding.radioGroup.setVisibility(View.GONE);
        binding.tvQuestion.setVisibility(View.GONE);
        binding.btnSubmit.setVisibility(View.GONE);
        binding.tvProgress.setText("Quiz Completed!");

        if (score == questionList.size()) {
            // 100% Score - Show Reward!
            binding.tvResult.setText("🎉 MashaAllah! You scored " + score + "/" + questionList.size() + "\nAll answers correct!");
            binding.tvResult.setTextColor(getResources().getColor(android.R.color.holo_green_light));
            binding.btnClaimReward.setVisibility(View.VISIBLE);
        } else {
            // Less than 100%
            binding.tvResult.setText("You scored " + score + "/" + questionList.size() + ".\nAll answers must be correct to win ₹5.\nTry again tomorrow!");
            binding.tvResult.setTextColor(getResources().getColor(android.R.color.holo_orange_light));
        }
    }
}
