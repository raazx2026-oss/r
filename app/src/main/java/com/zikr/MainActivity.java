package com.zikr;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.MenuItem;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.GravityCompat;
import androidx.fragment.app.Fragment;

import com.google.android.material.navigation.NavigationView;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

import com.zikr.databinding.ActivityMainBinding;

public class MainActivity extends AppCompatActivity {
    
    private ActivityMainBinding binding;
    private DatabaseReference mDatabase;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 🌟 1. STATE PERSISTENCE: Check last visited screen 🌟
        SharedPreferences prefs = getSharedPreferences("AppPrefs", MODE_PRIVATE);
        String lastScreen = prefs.getString("LastScreen", "HOME");

        // Agar pichli baar Social khula tha, toh direct wahan bhej do
        if (lastScreen.equals("SOCIAL")) {
            startActivity(new Intent(MainActivity.this, SocialActivity.class));
            finish(); // Main activity close kardo
            return;
        }

        // 🌟 2. ViewBinding Setup 🌟
        binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        // 🌟 3. Navigation Drawer & Menu Setup 🌟
        binding.menuIcon.setOnClickListener(v -> binding.drawerLayout.openDrawer(GravityCompat.START));

        binding.navigationView.setNavigationItemSelectedListener(new NavigationView.OnNavigationItemSelectedListener() {
            @Override
            public boolean onNavigationItemSelected(@NonNull MenuItem item) {
                int id = item.getItemId();

                if (id == R.id.nav_home) {
                    showDashboard();
                } 
                else if (id == R.id.nav_social) {
                    // Save state ki ab hum Social App pe hain
                    getSharedPreferences("AppPrefs", MODE_PRIVATE).edit().putString("LastScreen", "SOCIAL").apply();
                    startActivity(new Intent(MainActivity.this, SocialActivity.class));
                    finish(); // Dashboard close karo
                } 
                else if (id == R.id.nav_about) {
                    loadFragment(new AboutFragment());
                } 
                else if (id == R.id.nav_contact) {
                    loadFragment(new ContactFragment());
                } 
                else if (id == R.id.nav_donate) {
                    loadFragment(new DonateFragment());
                }

                binding.drawerLayout.closeDrawer(GravityCompat.START);
                return true;
            }
        });

        // 🌟 4. Firebase Realtime Database (Daily Message) 🌟
        mDatabase = FirebaseDatabase.getInstance().getReference("app_settings");
        mDatabase.child("daily_message").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                if (snapshot.exists()) {
                    String message = snapshot.getValue(String.class);
                    binding.tvDynamicMessage.setText(message);
                } else {
                    binding.tvDynamicMessage.setText("Welcome to Zikr & Social Community!");
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                binding.tvDynamicMessage.setText("Failed to load message.");
            }
        });

        // 🌟 5. Dashboard Cards Clicks 🌟
        binding.bannerQuiz.setOnClickListener(v -> startActivity(new Intent(MainActivity.this, QuizActivity.class)));
        binding.cardSurah.setOnClickListener(v -> startActivity(new Intent(MainActivity.this, SurahActivity.class)));
        binding.cardHistory.setOnClickListener(v -> startActivity(new Intent(MainActivity.this, HistoryActivity.class)));
        binding.cardTahajjud.setOnClickListener(v -> startActivity(new Intent(MainActivity.this, TahajjudActivity.class)));
        binding.cardTasbeeh.setOnClickListener(v -> startActivity(new Intent(MainActivity.this, TasbeehActivity.class)));

        // 🌟 6. Start Premium UI Animations 🌟
        playEntranceAnimations();
    }

    // --- HELPER METHODS --- //
    private void showDashboard() {
        binding.fragmentContainer.setVisibility(View.GONE);
        binding.mainDashboard.setVisibility(View.VISIBLE);
        binding.tvToolbarTitle.setText("Zikr App");
    }

    private void loadFragment(Fragment fragment) {
        binding.mainDashboard.setVisibility(View.GONE);
        binding.fragmentContainer.setVisibility(View.VISIBLE);
        binding.tvToolbarTitle.setText("Information");
        getSupportFragmentManager().beginTransaction()
                .replace(R.id.fragmentContainer, fragment)
                .commit();
    }

    private void playEntranceAnimations() {
        View[] viewsToAnimate = {
            binding.tvHeader, 
            binding.cardFirebaseMessage, 
            binding.bannerQuiz, 
            binding.cardSurah, 
            binding.cardHistory, 
            binding.cardTahajjud, 
            binding.cardTasbeeh
        };

        for (View v : viewsToAnimate) {
            v.setTranslationY(150f);
            v.setAlpha(0f);
        }

        int delay = 100;
        for (View v : viewsToAnimate) {
            v.animate()
                .translationY(0f)
                .alpha(1f)
                .setDuration(500)
                .setStartDelay(delay)
                .setInterpolator(new DecelerateInterpolator())
                .start();
            delay += 100;
        }
    }
}
